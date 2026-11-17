// Central de Autorizações do Diretor (José, 17/11/2026) — aba "Autorizações" da Visão da empresa.
// Junta numa fila só o que espera o Diretor (ou um Dev), por setor e assunto:
//   Requisições · R$ 200 ou mais   → "Requisicao".autorizacao_status (sql/autorizacoes-requisicao.sql) — decide AQUI
//   Pós-Vendas · Comissões         → posvendas_comissoes (decide na janela que já existe, ?comissoes=1)
//   Administração · Ficha cadastral → usuario_ficha_pedidos (decide na janela que já existe, ?fichas=1)
//   Compras · Solicitação de compra → tickets com sc_etapa='diretoria' (decide no ticket)
// Cada fonte que falhar (tabela/coluna faltando) só some da lista e vira aviso — as outras continuam.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import type { Autenticado } from '@/lib/auth/server';
import { usuarioDoSolicitante, type UsuarioPortal } from '@/lib/requisicoes/lembretes';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';
import { MODULO_EMPRESA, ACAO_AUTORIZAR_REQUISICOES } from '@/lib/permissoes/empresa';

export type ItemAutorizacao = {
  fonte: 'requisicao' | 'comissao' | 'ficha' | 'compra';
  id: string;
  setor: string;
  assunto: string;
  titulo: string;
  detalhe: string;
  valor: number | null;
  pedido_por: string | null;
  pedido_em: string | null;
  link: string;
  /** só a requisição é decidida direto na aba */
  decideAqui: boolean;
  extra?: Record<string, unknown>;
};

export type RegraAutorizacao = { assunto: string; setor: string; titulo: string; limite: number; ativo: boolean; desde: string; atualizado_por: string | null; atualizado_em: string };

// linha crua do banco (várias tabelas legadas sem tipo)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const faltando = (m?: string) => !!m && /does not exist|could not find|schema cache|column .* not found/i.test(m);

export type Autorizador = { id: string; nome: string; email: string | null; /** Diretor ou Dev: vê e decide tudo */ completo: boolean };

/** Diretor ou Dev (tudo), ou quem tem "empresa:autorizar-requisicoes" no Admin (só requisições — 17/11/2026). */
export async function quemAutoriza(a: Autenticado | null): Promise<Autorizador | null> {
  if (!a) return null;
  const { data } = await sb.from('portal_permissoes').select('is_diretor, is_dev, modulos_permitidos').eq('user_id', a.userId).maybeSingle();
  const p = (data || {}) as { is_diretor?: boolean; is_dev?: boolean; modulos_permitidos?: string[] | null };
  const completo = !!(p.is_diretor || p.is_dev || a.isDev);
  const soRequisicoes = (p.modulos_permitidos || []).includes(`${MODULO_EMPRESA}:${ACAO_AUTORIZAR_REQUISICOES}`);
  if (!completo && !soRequisicoes) return null;
  const { data: u } = await sb.from('financeiro_usu').select('nome').eq('id', a.userId).maybeSingle();
  return { id: a.userId, nome: (u as { nome?: string } | null)?.nome || a.email || a.userId, email: a.email, completo };
}

export async function lerRegras(): Promise<{ regras: RegraAutorizacao[]; falta: boolean }> {
  const { data, error } = await sb.from('portal_autorizacao_regras').select('*').order('assunto');
  if (error) return { regras: [], falta: faltando(error.message) };
  return { regras: (data || []) as RegraAutorizacao[], falta: false };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** a requisição foi pedida para quem? vazio = para todos que podem autorizar */
const paraDe = (r: Linha): string[] => (Array.isArray(r.autorizacao_para) ? r.autorizacao_para.map(String) : []);

async function pendentesRequisicoes(eu?: Autorizador): Promise<ItemAutorizacao[]> {
  let q: { data: Linha[] | null; error: { message: string } | null } = await sb.from('Requisicao')
    .select('id, titulo, tipo, setor, solicitante, criado_por, valor_despeza, fornecedor, status, autorizacao_status, autorizacao_pedida_em, autorizacao_motivo, autorizacao_obs, autorizacao_para, created_at')
    .in('autorizacao_status', ['aguardando'])
    .order('autorizacao_pedida_em', { ascending: true })
    .limit(300);
  // sem a coluna autorizacao_para (SQL ainda não rodado): lê do jeito antigo
  if (q.error && faltando(q.error.message)) {
    q = await sb.from('Requisicao')
      .select('id, titulo, tipo, setor, solicitante, criado_por, valor_despeza, fornecedor, status, autorizacao_status, autorizacao_pedida_em, autorizacao_motivo, autorizacao_obs, created_at')
      .in('autorizacao_status', ['aguardando']).order('autorizacao_pedida_em', { ascending: true }).limit(300);
  }
  const { data, error } = q;
  if (error) throw new Error(error.message);
  // quem não é Diretor/Dev só vê o que foi pedido para ele (ou para todos)
  const linhas = ((data || []) as Linha[]).filter((r) => !eu || eu.completo || !paraDe(r).length || paraDe(r).includes(eu.id));
  const ids = [...new Set(linhas.flatMap(paraDe))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await sb.from('financeiro_usu').select('id, nome').in('id', ids);
    for (const u of (us || []) as { id: string; nome: string }[]) nomes.set(String(u.id), u.nome);
  }
  return linhas.map((r: Linha) => ({
    fonte: 'requisicao',
    id: String(r.id),
    setor: r.setor ? `Requisições · ${r.setor}` : 'Requisições',
    assunto: 'Requisição de R$ 200 ou mais',
    titulo: `#${r.id} ${r.titulo || ''}`.trim(),
    detalhe: [r.tipo, r.fornecedor].filter(Boolean).join(' · '),
    valor: parseValorBR(r.valor_despeza),
    pedido_por: r.solicitante || r.criado_por || null,
    pedido_em: r.autorizacao_pedida_em || r.created_at,
    link: `/requisicoes?req=${r.id}`,
    decideAqui: true,
    extra: { motivo: r.autorizacao_motivo || null, status: r.status, para: paraDe(r).map((id) => nomes.get(id) || 'alguém') },
  }));
}

async function pendentesComissoes(): Promise<ItemAutorizacao[]> {
  const { data, error } = await sb.from('posvendas_comissoes')
    .select('id, tecnico, mes, valor, pedido_por, pedido_em')
    .eq('status', 'aguardando').order('pedido_em').limit(200);
  if (error) throw new Error(error.message);
  return (data || []).map((p: Linha) => ({
    fonte: 'comissao',
    id: String(p.id),
    setor: 'Pós-Vendas',
    assunto: 'Comissão dos técnicos',
    titulo: `${p.tecnico} — ${String(p.mes || '').split('-').reverse().join('/')}`,
    detalhe: 'Abre a janela de autorização com assinatura',
    valor: Number(p.valor) || 0,
    pedido_por: p.pedido_por || null,
    pedido_em: p.pedido_em || null,
    link: '/empresa?area=autorizacoes&comissoes=1',
    decideAqui: false,
  }));
}

async function pendentesFichas(): Promise<ItemAutorizacao[]> {
  const { data, error } = await sb.from('usuario_ficha_pedidos')
    .select('id, user_nome, pedido_por_nome, mudancas, criado_em')
    .eq('status', 'pendente').order('criado_em').limit(200);
  if (error) throw new Error(error.message);
  return (data || []).map((p: Linha) => ({
    fonte: 'ficha',
    id: String(p.id),
    setor: 'Administração',
    assunto: 'Mudança na ficha cadastral',
    titulo: `Ficha de ${p.user_nome || 'funcionário'}`,
    detalhe: `${Array.isArray(p.mudancas) ? p.mudancas.length : 0} campo(s) mudado(s)`,
    valor: null,
    pedido_por: p.pedido_por_nome || null,
    pedido_em: p.criado_em || null,
    link: '/empresa?area=autorizacoes&fichas=1',
    decideAqui: false,
  }));
}

async function pendentesCompras(): Promise<ItemAutorizacao[]> {
  const { data, error } = await sb.from('tickets')
    .select('id, numero, titulo, payload, created_at, solicitante_id')
    .eq('sc_etapa', 'diretoria').order('created_at').limit(200);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data || []).map((t: Linha) => t.solicitante_id).filter(Boolean))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await sb.from('financeiro_usu').select('id, nome').in('id', ids);
    for (const u of (us || []) as { id: string; nome: string }[]) nomes.set(String(u.id), u.nome);
  }
  return (data || []).map((t: Linha) => {
    const p = (t.payload || {}) as Linha;
    const qtd = Number(p.quantidade_aprovada ?? p.quantidade_solicitada ?? 0);
    const unit = parseValorBR(p.valor_unitario ?? p.preco_alvo ?? 0);
    const total = p.valor_total != null ? Number(p.valor_total) : qtd * unit;
    return {
      fonte: 'compra',
      id: String(t.id),
      setor: 'Compras',
      assunto: 'Solicitação de compra',
      titulo: t.titulo || `SC ${t.numero || ''}`,
      detalhe: [t.numero ? `Ticket ${t.numero}` : '', p.produto, qtd ? `${qtd} un.` : ''].filter(Boolean).join(' · '),
      valor: total || null,
      pedido_por: nomes.get(String(t.solicitante_id)) || null,
      pedido_em: t.created_at || null,
      link: `/tickets/${t.id}`,
      decideAqui: false,
    } as ItemAutorizacao;
  });
}

/** completo = Diretor/Dev (tudo); senão só as requisições (quem tem "Autorizar requisições") */
export async function listarPendentes(completo = true, eu?: Autorizador): Promise<{ itens: ItemAutorizacao[]; avisos: string[] }> {
  const fontes: [string, () => Promise<ItemAutorizacao[]>][] = [
    ['Requisições (falta rodar sql/autorizacoes-requisicao.sql)', () => pendentesRequisicoes(eu)],
    ...(completo ? [
      ['Comissões', pendentesComissoes],
      ['Fichas cadastrais', pendentesFichas],
      ['Solicitações de compra', pendentesCompras],
    ] as [string, () => Promise<ItemAutorizacao[]>][] : []),
  ];
  const res = await Promise.allSettled(fontes.map(([, f]) => f()));
  const itens: ItemAutorizacao[] = [];
  const avisos: string[] = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') itens.push(...r.value);
    else avisos.push(`${fontes[i][0]}: não deu para ler (${String((r.reason as Error)?.message || r.reason).slice(0, 120)})`);
  });
  return { itens, avisos };
}

/** últimas requisições decididas (para o histórico da aba) */
export async function decididasRequisicoes(limite = 40) {
  const { data, error } = await sb.from('Requisicao')
    .select('id, titulo, valor_despeza, autorizacao_status, autorizacao_valor, autorizacao_por, autorizacao_em, autorizacao_obs')
    .in('autorizacao_status', ['autorizada', 'recusada'])
    .order('autorizacao_em', { ascending: false }).limit(limite);
  if (error) return [];
  return data || [];
}

export async function decidirRequisicao(id: number, acao: 'autorizar' | 'recusar', obs: string, autor: { id: string; nome: string; completo?: boolean }) {
  const { data: r, error } = await sb.from('Requisicao')
    .select('id, titulo, status, solicitante, criado_por, valor_despeza, autorizacao_status').eq('id', id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { status: faltando(error.message) ? 503 : 500 });
  if (!r) throw Object.assign(new Error('Requisição não encontrada'), { status: 404 });
  if (r.autorizacao_status !== 'aguardando') throw Object.assign(new Error('Essa requisição não está esperando autorização (alguém já decidiu?)'), { status: 409 });
  // pedida para outra pessoa: só ela, o Diretor ou um Dev decidem
  if (!autor.completo) {
    const { data: p } = await sb.from('Requisicao').select('autorizacao_para').eq('id', id).maybeSingle();
    const para = paraDe((p || {}) as Linha);
    if (para.length && !para.includes(autor.id)) throw Object.assign(new Error('Essa requisição foi pedida para outra pessoa.'), { status: 403 });
  }
  if (acao === 'recusar' && !obs.trim()) throw Object.assign(new Error('Escreva o motivo da recusa'), { status: 400 });

  const valor = parseValorBR(r.valor_despeza);
  const agora = new Date().toISOString();
  const { error: e2 } = await sb.from('Requisicao').update({
    autorizacao_status: acao === 'autorizar' ? 'autorizada' : 'recusada',
    autorizacao_valor: acao === 'autorizar' ? valor : null,
    autorizacao_por: autor.nome, autorizacao_por_id: autor.id, autorizacao_em: agora,
    autorizacao_obs: obs.trim() || null,
    // recusada vai para a fase oculta; autorizada FICA em "Aguardando autorização" com o selo Aprovada até alguém mover (José, 17/11/2026)
    ...(acao === 'recusar' ? { status: 'recusada' } : {}),
  }).eq('id', id).eq('autorizacao_status', 'aguardando');
  if (e2) throw Object.assign(new Error(e2.message), { status: 500 });

  await sb.from('audit_log').insert({
    user_id: autor.id, user_nome: autor.nome, sistema: 'requisicoes',
    acao: acao === 'autorizar' ? 'autorizar_requisicao' : 'recusar_requisicao',
    entidade: 'requisicao', entidade_id: String(id), entidade_label: r.titulo || `#${id}`,
    detalhes: { valor, obs: obs.trim() || null },
  });

  // avisa quem pediu (solicitante é texto: casa por e-mail/nome com os usuários do portal)
  try {
    const { data: us } = await sb.from('financeiro_usu').select('id, nome, email, ativo');
    const usuarios = (us || []) as UsuarioPortal[];
    const alvos = new Set<string>();
    for (const nome of [r.solicitante, r.criado_por]) {
      const u = usuarioDoSolicitante(nome, usuarios);
      if (u?.id && u.id !== autor.id) alvos.add(String(u.id));
    }
    if (alvos.size) {
      await sb.from('portal_notificacoes').insert([...alvos].map((uid) => ({
        user_id: uid, tipo: 'requisicao',
        titulo: acao === 'autorizar' ? `Requisição #${id} autorizada por ${autor.nome.split(' ')[0]}` : `Requisição #${id} recusada por ${autor.nome.split(' ')[0]}`,
        descricao: `${r.titulo || ''} — ${brl(valor)}${obs.trim() ? ` · ${obs.trim()}` : ''}`,
        link: `/requisicoes?req=${id}`,
      })));
    }
  } catch { /* aviso não trava a decisão */ }
  return { ok: true };
}

/** quem pode receber o pedido: Diretor(es) e quem tem "Autorizar requisições" (Devs decidem, mas não entram na lista) */
export async function listarAutorizadores(): Promise<{ id: string; nome: string; papel: string }[]> {
  const { data } = await sb.from('portal_permissoes').select('user_id, is_diretor, modulos_permitidos');
  const alvo = ((data || []) as { user_id: string; is_diretor?: boolean; modulos_permitidos?: string[] | null }[])
    .filter((p) => p.user_id && (p.is_diretor || (p.modulos_permitidos || []).includes(`${MODULO_EMPRESA}:${ACAO_AUTORIZAR_REQUISICOES}`)));
  if (!alvo.length) return [];
  const { data: us } = await sb.from('financeiro_usu').select('id, nome, ativo').in('id', alvo.map((p) => p.user_id));
  const nome = new Map(((us || []) as { id: string; nome: string; ativo?: boolean }[]).filter((u) => u.ativo !== false).map((u) => [String(u.id), u.nome]));
  return alvo.filter((p) => nome.has(String(p.user_id)))
    .map((p) => ({ id: String(p.user_id), nome: nome.get(String(p.user_id))!, papel: p.is_diretor ? 'Diretor' : 'Autoriza requisições' }))
    .sort((a, b) => (a.papel === b.papel ? a.nome.localeCompare(b.nome) : a.papel === 'Diretor' ? -1 : 1));
}

export async function salvarRegra(assunto: string, limite: number, ativo: boolean, autor: string) {
  const { error } = await sb.from('portal_autorizacao_regras')
    .update({ limite, ativo, atualizado_por: autor, atualizado_em: new Date().toISOString() }).eq('assunto', assunto);
  if (error) throw Object.assign(new Error(error.message), { status: faltando(error.message) ? 503 : 500 });
}
