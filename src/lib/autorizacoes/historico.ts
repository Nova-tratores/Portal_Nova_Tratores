// Histórico das autorizações (José, 19/11/2026) — SÓ SERVIDOR. Aba Autorizações › Histórico da Visão da empresa.
// "Precisa aparecer o histórico do que foi autorizado por aquele usuário, separado em cartões (requisição,
// comissão…). Comissão divide por setor (Comercial / Pós-Vendas) e por mês, com o PDF gerado depois de autorizar."
// Cada fonte guarda quem decidiu de um jeito:
//   Requisição      → Requisicao.autorizacao_por_id (ou autorizacao_por = nome, nas antigas)
//   Comissão PV     → posvendas_comissoes_eventos (autor_id, tipo autorizada/devolvida) + decidido_por (nome)
//   Ficha cadastral → usuario_ficha_pedidos.decidido_por (uuid)
//   Compra          → tickets_eventos do autor com tipo 'qtd_alterada' (o que a Diretoria faz na SC)
// A comissão do Comercial ainda não passa por autorização no portal: o cartão aparece vazio, com o aviso.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;
const faltando = (m?: string) => !!m && /does not exist|could not find|schema cache|column .* not found/i.test(m);

export type ItemHistorico = {
  fonte: 'requisicao' | 'comissao' | 'ficha' | 'compra';
  /** só comissão: setor dono da comissão */
  setor: 'Pós-Vendas' | 'Comercial' | null;
  id: string;
  titulo: string;
  detalhe: string;
  valor: number | null;
  resultado: 'autorizada' | 'recusada' | 'devolvida';
  decidido_em: string | null;
  /** AAAA-MM: comissão = mês da comissão; o resto = mês da decisão */
  mes: string;
  obs: string | null;
  /** nome de quem decidiu */
  por: string | null;
  link: string | null;
  /** comissão: documento da autorização (com assinaturas) e as folhas assinadas escaneadas */
  docs?: { autorizacao: boolean; ciencia: boolean; recibo: boolean };
};

/** alvo = uma pessoa; null = todo mundo (Diretor/Dev, visão "Todos") */
type Alvo = { id: string; nome: string } | null;

/** id → nome (financeiro_usu) */
async function nomesDe(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await sb.from('financeiro_usu').select('id, nome').in('id', unicos);
  return new Map(((data || []) as Linha[]).map((u) => [String(u.id), String(u.nome)]));
}

const mesDe = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7) : '');

async function historicoRequisicoes(alvo: Alvo): Promise<ItemHistorico[]> {
  const cols = 'id, titulo, setor, tipo, fornecedor, valor_despeza, autorizacao_status, autorizacao_valor, autorizacao_em, autorizacao_obs, autorizacao_por';
  const base = () => sb.from('Requisicao').select(cols).in('autorizacao_status', ['autorizada', 'recusada'])
    .order('autorizacao_em', { ascending: false }).limit(alvo ? 500 : 1500);
  let q: { data: Linha[] | null; error: { message: string } | null } = alvo ? await base().eq('autorizacao_por_id', alvo.id) : await base();
  // sem a coluna do id (SQL antigo): casa pelo nome
  if (alvo && q.error && faltando(q.error.message)) {
    q = await sb.from('Requisicao').select(cols).eq('autorizacao_por', alvo.nome).in('autorizacao_status', ['autorizada', 'recusada'])
      .order('autorizacao_em', { ascending: false }).limit(500);
  }
  if (q.error) throw new Error(q.error.message);
  return (q.data || []).map((r) => ({
    fonte: 'requisicao', setor: null, id: String(r.id),
    titulo: `#${r.id} ${r.titulo || ''}`.trim(),
    detalhe: [r.setor, r.tipo, r.fornecedor].filter(Boolean).join(' · '),
    valor: r.autorizacao_valor != null ? Number(r.autorizacao_valor) : parseValorBR(r.valor_despeza),
    resultado: r.autorizacao_status === 'autorizada' ? 'autorizada' : 'recusada',
    decidido_em: r.autorizacao_em || null, mes: mesDe(r.autorizacao_em), obs: r.autorizacao_obs || null,
    por: r.autorizacao_por || null,
    link: `/requisicoes?req=${r.id}`,
  }));
}

async function historicoComissoesPV(alvo: Alvo): Promise<ItemHistorico[]> {
  const base = 'id, tecnico, mes, valor, status, decidido_por, decidido_em, observacao';
  // uma pessoa: pelo evento (tem o id de quem decidiu) e, para os antigos, pelo nome gravado no pedido
  const { data: evs } = alvo ? await sb.from('posvendas_comissoes_eventos').select('pedido_id')
    .eq('autor_id', alvo.id).in('tipo', ['autorizada', 'devolvida']).limit(1000) : { data: [] as Linha[] };
  const ids = [...new Set(((evs || []) as Linha[]).map((e) => String(e.pedido_id)))];
  const ler = async (cols: string) => {
    if (!alvo) { // todo mundo: todas as comissões já decididas
      const q = await sb.from('posvendas_comissoes').select(cols).not('decidido_em', 'is', null).order('decidido_em', { ascending: false }).limit(1500);
      return { linhas: (q.data || []) as unknown as Linha[], erro: q.error };
    }
    const [porId, porNome] = await Promise.all([
      ids.length ? sb.from('posvendas_comissoes').select(cols).in('id', ids) : Promise.resolve({ data: [] as Linha[], error: null }),
      sb.from('posvendas_comissoes').select(cols).eq('decidido_por', alvo.nome).limit(500),
    ]);
    return { linhas: [...((porId.data || []) as unknown as Linha[]), ...((porNome.data || []) as unknown as Linha[])], erro: porId.error || porNome.error };
  };
  let r = await ler(`${base}, ciencia_arquivo, recibo_arquivo`);
  if (r.erro && faltando(r.erro.message)) r = await ler(base); // SQL do recibo ainda não rodado
  if (r.erro) throw new Error(r.erro.message);
  const vistos = new Set<string>();
  const out: ItemHistorico[] = [];
  for (const p of r.linhas) {
    const id = String(p.id);
    if (vistos.has(id) || !p.decidido_em || p.status === 'aguardando' || p.status === 'cancelada') continue;
    vistos.add(id);
    const devolvida = p.status === 'devolvida';
    const extra = p.status === 'erro_rh' ? 'autorizada, mas deu erro ao lançar no RH'
      : p.status === 'substituida' ? 'trocada depois por um pedido novo'
      : p.status === 'espelhada' ? 'lançada no RH' : '';
    out.push({
      fonte: 'comissao', setor: 'Pós-Vendas', id,
      titulo: String(p.tecnico),
      detalhe: extra,
      valor: Number(p.valor) || 0,
      resultado: devolvida ? 'devolvida' : p.status === 'recusada' ? 'recusada' : 'autorizada',
      decidido_em: p.decidido_em, mes: String(p.mes || mesDe(p.decidido_em)), obs: p.observacao || null,
      por: p.decidido_por || null,
      link: `/mecanicos?aba=mecanicos&tecnico=${encodeURIComponent(String(p.tecnico))}&secao=comissao&mes=${p.mes}`,
      docs: devolvida ? undefined : { autorizacao: true, ciencia: !!p.ciencia_arquivo, recibo: !!p.recibo_arquivo },
    });
  }
  return out;
}

async function historicoFichas(alvo: Alvo): Promise<ItemHistorico[]> {
  let q = sb.from('usuario_ficha_pedidos').select('id, user_nome, mudancas, status, decidido_em, decidido_por, motivo')
    .in('status', ['aprovado', 'recusado']).order('decidido_em', { ascending: false }).limit(alvo ? 300 : 1000);
  if (alvo) q = q.eq('decidido_por', alvo.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const lista = (data || []) as Linha[];
  const nomes = alvo ? new Map([[alvo.id, alvo.nome]]) : await nomesDe(lista.map((p) => String(p.decidido_por || '')));
  return lista.map((p) => ({
    fonte: 'ficha', setor: null, id: String(p.id),
    titulo: `Ficha de ${p.user_nome || 'funcionário'}`,
    detalhe: `${Array.isArray(p.mudancas) ? p.mudancas.length : 0} campo(s) mudado(s)`,
    valor: null, resultado: p.status === 'aprovado' ? 'autorizada' : 'recusada',
    decidido_em: p.decidido_em || null, mes: mesDe(p.decidido_em), obs: p.motivo || null, link: null,
    por: nomes.get(String(p.decidido_por || '')) || null,
  }));
}

async function historicoCompras(alvo: Alvo): Promise<ItemHistorico[]> {
  let q = sb.from('tickets_eventos').select('ticket_id, autor_id, payload, created_at')
    .eq('tipo', 'qtd_alterada').order('created_at', { ascending: false }).limit(alvo ? 500 : 1500);
  if (alvo) q = q.eq('autor_id', alvo.id);
  const { data: evs, error } = await q;
  if (error) throw new Error(error.message);
  const lista = (evs || []) as Linha[];
  if (!lista.length) return [];
  const nomes = alvo ? new Map([[alvo.id, alvo.nome]]) : await nomesDe(lista.map((e) => String(e.autor_id || '')));
  const { data: ts } = await sb.from('tickets').select('id, numero, titulo, tipo, payload').in('id', [...new Set(lista.map((e) => String(e.ticket_id)))]);
  const tickets = new Map(((ts || []) as Linha[]).filter((t) => t.tipo === 'compras').map((t) => [String(t.id), t]));
  return lista.filter((e) => tickets.has(String(e.ticket_id))).map((e) => {
    const t = tickets.get(String(e.ticket_id))!;
    const ev = (e.payload || {}) as Linha;
    const p = (t.payload || {}) as Linha;
    const devolvida = !!ev.devolvido;
    return {
      fonte: 'compra', setor: null, id: `${t.id}:${e.created_at}`,
      titulo: t.titulo || `SC ${t.numero || ''}`,
      detalhe: [t.numero ? `Ticket ${t.numero}` : '', p.produto, !devolvida && ev.para ? `${ev.para} un. aprovadas` : ''].filter(Boolean).join(' · '),
      valor: devolvida ? null : (p.valor_total != null ? Number(p.valor_total) : null),
      resultado: devolvida ? 'devolvida' : 'autorizada',
      decidido_em: e.created_at || null, mes: mesDe(e.created_at), obs: ev.justificativa || null,
      por: nomes.get(String(e.autor_id || '')) || null,
      link: `/tickets/${t.id}`,
    } as ItemHistorico;
  });
}

/** Tudo que `alvo` decidiu (alvo null = de todo mundo). Diretor/Dev vê as 4 fontes; quem só autoriza requisições vê só as requisições. */
export async function historicoDecisoes(alvo: Alvo, completo: boolean): Promise<{ itens: ItemHistorico[]; avisos: string[] }> {
  const fontes: [string, () => Promise<ItemHistorico[]>][] = [
    ['Requisições', () => historicoRequisicoes(alvo)],
    ...(completo ? [
      ['Comissões', () => historicoComissoesPV(alvo)],
      ['Fichas cadastrais', () => historicoFichas(alvo)],
      ['Solicitações de compra', () => historicoCompras(alvo)],
    ] as [string, () => Promise<ItemHistorico[]>][] : []),
  ];
  const res = await Promise.allSettled(fontes.map(([, f]) => f()));
  const itens: ItemHistorico[] = [];
  const avisos: string[] = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') itens.push(...r.value);
    else avisos.push(`${fontes[i][0]}: não deu para ler o histórico (${String((r.reason as Error)?.message || r.reason).slice(0, 120)})`);
  });
  itens.sort((a, b) => String(b.decidido_em || '').localeCompare(String(a.decidido_em || '')));
  return { itens, avisos };
}
