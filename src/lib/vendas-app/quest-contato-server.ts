// Contato do alvo de uma quest — SÓ NO SERVIDOR (service role).
// Ordem de confiança: cliente do chassi no Omie (portal_nt_projetos_chassis →
// cadastro Omie) > cliente achado pelo NOME no cadastro Omie (mesma regra de nome
// do app: igual, começa igual, ou uma letra de diferença; prefere a cidade da
// quest) > propriedade do CRM (propriedade_id) > telefone escrito na descrição.
// Lugar: locaisDoTrator (visita do vendedor > GPS do técnico > CRM > cadastro).
// "Pedir ao suporte" vira notificação no sino do Mariano no portal.
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { locaisDoTrator, type LocalMapa } from '@/lib/clientes/locais-server';
import { nomeChave, umaLetraDeDiferenca } from './tratores-cidade';
import {
  faltaContato, juntarTelefones, mesclarSuporte, telefonesDoTexto, textoPedidoSuporte, textoRespostaVendedor,
  type FaltaContato, type RespostaSuporte, type TelefoneQuest,
} from './quest-contato';

export interface QuestAlvo {
  id: number; vendedor_id: number | null; titulo: string; descricao: string | null;
  chassis: string | null; modelo: string | null; cliente_nome: string | null; cidade: string | null; propriedade_id: number | null;
}
export interface ContatoQuest {
  cliente: { nome: string; cod: number | null; doc: string | null } | null;
  telefones: TelefoneQuest[];
  endereco: string | null;
  locais: LocalMapa[];
  falta: FaltaContato[];
  /** último pedido ao suporte desta quest/deste negócio (null = nunca pediu ou sem a migration) */
  pedido?: PedidoResumo | null;
}
export interface PedidoResumo {
  id: number; status: 'aberto' | 'respondido' | 'dispensado'; falta: string[]; criado_em: string;
  respondido_em: string | null; respondido_por: string | null; resposta_obs: string | null;
}

interface Cadastro { cod_cli: number; razao_social: string | null; nome_fantasia: string | null; cnpj_cpf: string | null; telefone: string | null; cidade: string | null; k: string; kf: string }

// cadastro Omie inteiro (~poucos mil) em memória 30 min: casar por nome precisa da lista toda
let cache: { em: number; linhas: Cadastro[] } | null = null;
async function cadastros(): Promise<Cadastro[]> {
  if (cache && Date.now() - cache.em < 30 * 60_000) return cache.linhas;
  const { data: rows, error } = await paginar<Omit<Cadastro, 'k' | 'kf'>>((a, b) => db.from('portal_nt_clientes_cadastro_omie')
    .select('cod_cli, razao_social, nome_fantasia, cnpj_cpf, telefone, cidade').order('cod_cli').range(a, b));
  if (error) throw new Error(error.message);
  const linhas = rows.map((r) => ({ ...r, k: nomeChave(r.razao_social), kf: nomeChave(r.nome_fantasia) }));
  cache = { em: Date.now(), linhas };
  return linhas;
}

const cidadeChave = (s: string | null | undefined) => nomeChave(String(s || '').replace(/\([^)]*\)/g, ''));

/** Cadastro do cliente pelo nome; com vários, o da cidade da quest e o que tem telefone. */
function porNome(lista: Cadastro[], nome: string | null, cidade: string | null): Cadastro | null {
  const k = nomeChave(nome);
  if (!k || k.length < 5 || k === 'NOVA TRATORES') return null;
  let c = lista.filter((x) => x.k === k || x.kf === k);
  if (!c.length && k.length >= 10) c = lista.filter((x) => x.k.startsWith(k + ' ') || k.startsWith(x.k + ' '));
  if (!c.length && k.length >= 12) c = lista.filter((x) => umaLetraDeDiferenca(x.k, k));
  if (!c.length) return null;
  const cid = cidadeChave(cidade);
  const pontos = (x: Cadastro) => (cid && cidadeChave(x.cidade) === cid ? 2 : 0) + (telefonesDoTexto(x.telefone, 'omie').length ? 1 : 0);
  return [...c].sort((a, b) => pontos(b) - pontos(a))[0];
}

export async function carregarQuest(id: number): Promise<QuestAlvo | null> {
  const { data } = await db.from('vendas_quests')
    .select('id, vendedor_id, titulo, descricao, chassis, modelo, cliente_nome, cidade, propriedade_id').eq('id', id).maybeSingle();
  return (data as QuestAlvo) || null;
}

export async function contatoDaQuest(q: QuestAlvo): Promise<ContatoQuest> {
  const chassi = String(q.chassis || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [doChassi, lista, prop] = await Promise.all([
    chassi.length >= 7
      ? db.from('portal_nt_projetos_chassis').select('chassis, cod_cli_ultimo, cliente_nome_ultimo, updated_at')
        .ilike('chassis', `%${chassi.slice(-7)}`).order('updated_at', { ascending: false }).limit(5)
        .then((r) => (r.data || []).find((x) => String(x.chassis || '').toUpperCase().endsWith(chassi.slice(-7))) || null)
      : Promise.resolve(null),
    cadastros().catch(() => [] as Cadastro[]),
    q.propriedade_id != null
      ? db.from('portal_nt_clientes_PRINCIPAL').select('id_omie, razao_social, nome_fantasia, telefone, endereco, cidade').eq('id', q.propriedade_id).maybeSingle()
        .then((r) => r.data || null)
      : Promise.resolve(null),
  ]);

  const cod = Number(doChassi?.cod_cli_ultimo) || Number(prop?.id_omie) || null;
  const cad = (cod ? lista.find((x) => Number(x.cod_cli) === cod) : null)
    || porNome(lista, q.cliente_nome || prop?.razao_social || null, q.cidade);
  const codFinal = cad?.cod_cli ?? cod;

  const { locais, endereco } = await locaisDoTrator({ chassi: chassi || null, codOmie: codFinal }).catch(() => ({ locais: [] as LocalMapa[], endereco: null }));
  const enderecoProp = prop ? [prop.endereco, prop.cidade].map((s) => String(s || '').trim()).filter(Boolean).join(', ') || null : null;

  const telefones = juntarTelefones(
    telefonesDoTexto(cad?.telefone, 'omie'),
    telefonesDoTexto(prop?.telefone, 'crm'),
    telefonesDoTexto(String(q.descricao || '').match(/telefone[^\n]*/gi)?.join('\n') || null, 'quest'),
  );
  const end = endereco || enderecoProp;
  const sup = await doSuporte({ questId: q.id, cod: codFinal, chassi });
  const m = mesclarSuporte({ telefones, endereco: end, locais }, sup.respostas) as { telefones: TelefoneQuest[]; endereco: string | null; locais: LocalMapa[] };
  return {
    cliente: cad
      ? { nome: String(cad.razao_social || cad.nome_fantasia || q.cliente_nome || ''), cod: cad.cod_cli, doc: cad.cnpj_cpf }
      : q.cliente_nome ? { nome: q.cliente_nome, cod: codFinal, doc: null } : null,
    telefones: m.telefones,
    endereco: m.endereco,
    locais: m.locais,
    falta: faltaContato({ telefones: m.telefones, temLocal: m.locais.length > 0, endereco: m.endereco }),
    pedido: sup.pedido,
  };
}

// ─── Pedido ao suporte ─────────────────────────────────────────────────────────
const MARIANO_PADRAO = '3c9d4cc0-3771-4b04-adf1-2b9a2f93ceaa'; // financeiro_usu ativo (mariano.novatratores@gmail.com)

/** Quem atende os pedidos de contato dos vendedores: o Mariano ativo no portal. */
async function idSuporte(): Promise<string> {
  const { data } = await db.from('financeiro_usu').select('id').eq('ativo', true).ilike('nome', 'mariano%').limit(1);
  return String(data?.[0]?.id || MARIANO_PADRAO);
}

export interface AlvoPedido {
  cliente: string | null; cidade: string | null; trator: string | null; negocio: string | null; questId: number | null;
  negocioId?: number | null; vendedorId?: number | null; chassis?: string | null;
}

/** Monta o pedido de uma quest (cliente, cidade e trator dela). */
export function alvoDaQuest(q: QuestAlvo, contato?: ContatoQuest | null): AlvoPedido {
  return {
    cliente: contato?.cliente?.nome || q.cliente_nome, cidade: q.cidade, questId: q.id, negocio: null,
    trator: q.chassis ? `${q.modelo || 'Trator'} …${String(q.chassis).slice(-6)}` : null,
    vendedorId: q.vendedor_id, chassis: q.chassis ? normChassi(q.chassis) : null,
  };
}

export async function pedirContatoAoSuporte(p: {
  vendedorNome: string; falta: FaltaContato[]; obs?: string | null; contato?: ContatoQuest | null;
  alvo: AlvoPedido;
}): Promise<{ ok: true; jaPedido: boolean; pedidoId?: number }> {
  const suporte = await idSuporte();
  const { titulo, descricao } = textoPedidoSuporte({ vendedor: p.vendedorNome, falta: p.falta, obs: p.obs, ...p.alvo });
  const cod = p.contato?.cliente?.cod ?? null;

  // pedido em aberto para a mesma quest/o mesmo negócio: não abre outro
  const filtro = p.alvo.questId ? { col: 'quest_id', v: p.alvo.questId } : p.alvo.negocioId ? { col: 'negocio_id', v: p.alvo.negocioId } : null;
  let pedidoId: number | null = null;
  let semTabela = false;
  if (filtro) {
    const { data: aberto, error } = await db.from(TABELA).select('id').eq(filtro.col, filtro.v).eq('status', 'aberto').limit(1);
    if (error) semTabela = tabelaFalta(error);
    else if (aberto?.length) return { ok: true, jaPedido: true, pedidoId: Number(aberto[0].id) };
  }
  if (!semTabela) {
    const { data, error } = await db.from(TABELA).insert({
      quest_id: p.alvo.questId, negocio_id: p.alvo.negocioId ?? null, vendedor_id: p.alvo.vendedorId ?? null,
      pedido_por: p.vendedorNome, falta: p.falta, obs: p.obs ?? null,
      alvo: [p.alvo.cliente, p.alvo.trator, p.alvo.negocio].filter(Boolean).join(' · ') || null,
      cliente_nome: p.alvo.cliente, cliente_cod: cod, cliente_doc: p.contato?.cliente?.doc ?? null,
      chassis: p.alvo.chassis ?? null, cidade: p.alvo.cidade, suporte_id: suporte,
    }).select('id').single();
    if (error) { if (!tabelaFalta(error)) throw new Error(error.message); }
    else pedidoId = Number(data.id);
  }

  // sem a tabela (migration não aplicada): como antes — o mesmo pedido em 12 h não repete
  if (!pedidoId) {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data: ja } = await db.from('portal_notificacoes').select('id').eq('user_id', suporte).eq('titulo', titulo).gte('created_at', desde).limit(1);
    if (ja?.length) return { ok: true, jaPedido: true };
  }
  const link = pedidoId ? `/crm-vendas/pedidos-contato?id=${pedidoId}` : cod ? `/clientes?cod=${cod}` : '/clientes';
  const { error } = await db.from('portal_notificacoes').insert({ user_id: suporte, tipo: 'avisos', titulo, descricao, link });
  if (error) throw new Error(error.message);
  return { ok: true, jaPedido: false, ...(pedidoId ? { pedidoId } : {}) };
}

// ─── Pedidos ao suporte: tabela vendas_pedidos_contato (sql/vendas-pedidos-contato.sql) ─
const TABELA = 'vendas_pedidos_contato';
const tabelaFalta = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST205' || e.code === '42P01' || /vendas_pedidos_contato/.test(String(e.message || ''));
function normChassi(c: string): string { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export interface PedidoContato {
  id: number; quest_id: number | null; negocio_id: number | null; vendedor_id: number | null; pedido_por: string;
  falta: string[]; obs: string | null; alvo: string | null; cliente_nome: string | null; cliente_cod: number | null;
  cliente_doc: string | null; chassis: string | null; cidade: string | null; suporte_id: string | null;
  status: 'aberto' | 'respondido' | 'dispensado'; telefone: string | null; celular: string | null; endereco: string | null;
  lat: number | null; lng: number | null; resposta_obs: string | null; respondido_por: string | null; respondido_em: string | null;
  created_at: string;
}

/**
 * Respostas do suporte que valem para este alvo (a própria quest/o negócio, o
 * mesmo cliente Omie ou o mesmo chassi) + o último pedido DELE, para o app
 * mostrar "pedido com o suporte" / "atualizado pelo suporte". Sem a tabela: nada.
 */
async function doSuporte(p: { questId?: number; negocioId?: number; cod: number | null; chassi: string }): Promise<{ respostas: RespostaSuporte[]; pedido: PedidoResumo | null }> {
  const ors = [
    p.questId ? `quest_id.eq.${p.questId}` : '',
    p.negocioId ? `negocio_id.eq.${p.negocioId}` : '',
    p.cod ? `cliente_cod.eq.${p.cod}` : '',
    p.chassi.length >= 7 && /^[A-Z0-9]+$/.test(p.chassi) ? `chassis.eq.${p.chassi}` : '',
  ].filter(Boolean);
  if (!ors.length) return { respostas: [], pedido: null };
  const { data, error } = await db.from(TABELA)
    .select('id, quest_id, negocio_id, status, falta, created_at, telefone, celular, endereco, lat, lng, resposta_obs, respondido_por, respondido_em')
    .or(ors.join(',')).order('created_at', { ascending: false }).limit(30);
  if (error || !data) return { respostas: [], pedido: null };
  const rows = data as PedidoContato[];
  const meu = rows.find((r) => (p.questId && r.quest_id === p.questId) || (p.negocioId && r.negocio_id === p.negocioId));
  return {
    respostas: rows.filter((r) => r.status === 'respondido'),
    pedido: meu ? {
      id: meu.id, status: meu.status, falta: meu.falta || [], criado_em: meu.created_at,
      respondido_em: meu.respondido_em, respondido_por: meu.respondido_por, resposta_obs: meu.resposta_obs,
    } : null,
  };
}

/** Lista para a tela do suporte. `null` = a tabela ainda não existe. */
export async function listarPedidos(status: 'aberto' | 'respondido' | 'todos'): Promise<PedidoContato[] | null> {
  let q = db.from(TABELA).select('*').order('created_at', { ascending: false }).limit(200);
  if (status !== 'todos') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { if (tabelaFalta(error)) return null; throw new Error(error.message); }
  return (data || []) as PedidoContato[];
}

export async function carregarPedido(id: number): Promise<PedidoContato | null> {
  const { data, error } = await db.from(TABELA).select('*').eq('id', id).maybeSingle();
  if (error) { if (tabelaFalta(error)) return null; throw new Error(error.message); }
  return (data as PedidoContato) || null;
}

/** O contato que o vendedor está vendo hoje para o alvo do pedido. */
export async function contatoDoPedido(p: PedidoContato): Promise<ContatoQuest | null> {
  if (p.quest_id) { const q = await carregarQuest(p.quest_id); return q ? contatoDaQuest(q) : null; }
  if (p.negocio_id) { const n = await carregarNegocio(p.negocio_id); return n ? contatoDoNegocio(n) : null; }
  return null;
}

/**
 * Suporte responde: grava e avisa o vendedor em mensagens_vendedor (botão "Abrir"
 * leva à quest). O recado é extra: se falhar, a resposta continua gravada.
 */
export async function responderPedido(p: PedidoContato, r: {
  telefone: string | null; celular: string | null; endereco: string | null; lat: number | null; lng: number | null; obs: string | null;
}, quem: string): Promise<{ avisado: boolean }> {
  const { error } = await db.from(TABELA).update({
    status: 'respondido', telefone: r.telefone, celular: r.celular, endereco: r.endereco, lat: r.lat, lng: r.lng,
    resposta_obs: r.obs, respondido_por: quem, respondido_em: new Date().toISOString(),
  }).eq('id', p.id);
  if (error) throw new Error(error.message);
  if (!p.vendedor_id) return { avisado: false };
  const alvo = [p.cliente_nome, p.chassis ? `trator …${p.chassis.slice(-6)}` : null].filter(Boolean).join(' · ') || p.alvo;
  const { titulo, corpo } = textoRespostaVendedor({ alvo, respondidoPor: quem, ...r, temLocal: r.lat != null });
  const link = p.quest_id ? `/quests/${p.quest_id}` : '/negocios';
  const { error: e2 } = await db.from('mensagens_vendedor').insert({ vendedor_id: p.vendedor_id, titulo, corpo, created_by: quem, link });
  return { avisado: !e2 };
}

/** Suporte não achou o contato: fecha o pedido e conta ao vendedor o porquê. */
export async function dispensarPedido(p: PedidoContato, motivo: string | null, quem: string): Promise<{ avisado: boolean }> {
  const { error } = await db.from(TABELA).update({
    status: 'dispensado', resposta_obs: motivo, respondido_por: quem, respondido_em: new Date().toISOString(),
  }).eq('id', p.id);
  if (error) throw new Error(error.message);
  if (!p.vendedor_id) return { avisado: false };
  const alvo = p.cliente_nome || p.alvo || 'o cliente';
  const { error: e2 } = await db.from('mensagens_vendedor').insert({
    vendedor_id: p.vendedor_id, titulo: 'Suporte não achou o contato', created_by: quem,
    corpo: `${quem} não encontrou o contato de ${alvo}.${motivo ? ` ${motivo}` : ''}`.slice(0, 1000),
    link: p.quest_id ? `/quests/${p.quest_id}` : '/negocios',
  });
  return { avisado: !e2 };
}

// ─── Negócio do funil (card de Negócios) ───────────────────────────────────────
export interface NegocioAlvo {
  id: number; vendedor_id: number | null; cliente_id: number | null; propriedade_id: number | null; cidade: string | null;
  maquina_familia: string | null; maquina_marca: string | null; maquina_modelo: string | null;
}

export async function carregarNegocio(id: number): Promise<NegocioAlvo | null> {
  const { data } = await db.from('negocios')
    .select('id, vendedor_id, cliente_id, propriedade_id, cidade, maquina_familia, maquina_marca, maquina_modelo').eq('id', id).maybeSingle();
  return (data as NegocioAlvo) || null;
}

const rotuloNegocio = (n: NegocioAlvo) => [n.maquina_familia, n.maquina_marca, n.maquina_modelo].filter(Boolean).join(' ') || `negócio #${n.id}`;

/**
 * Contato do negócio: a propriedade do CRM (telefone, endereço, ponto do 1º
 * check-in), as pessoas cadastradas nela, o cliente do vendedor e, se a
 * propriedade está ligada à Omie, o cadastro Omie + locais (GPS do técnico…).
 */
export async function contatoDoNegocio(n: NegocioAlvo): Promise<ContatoQuest> {
  const [prop, pessoas, cli] = await Promise.all([
    n.propriedade_id != null
      ? db.from('portal_nt_clientes_PRINCIPAL').select('id_omie, razao_social, nome_fantasia, cnpj_cpf, telefone, endereco, cidade, latitude, longitude, lat, lng')
        .eq('id', n.propriedade_id).maybeSingle().then((r) => r.data || null)
      : Promise.resolve(null),
    n.propriedade_id != null
      ? db.from('pessoas').select('nome, cargo, telefone').eq('propriedade_id', n.propriedade_id).limit(20).then((r) => r.data || [])
      : Promise.resolve([]),
    n.cliente_id != null
      ? db.from('clientes_vendas').select('nome, telefone').eq('id', n.cliente_id).maybeSingle().then((r) => (r.error ? null : r.data))
      : Promise.resolve(null),
  ]);
  const cod = Number(prop?.id_omie) || null;
  const lista = cod ? await cadastros().catch(() => [] as Cadastro[]) : [];
  const cad = cod ? lista.find((x) => Number(x.cod_cli) === cod) || null : null;
  const { locais, endereco } = cod
    ? await locaisDoTrator({ codOmie: cod }).catch(() => ({ locais: [] as LocalMapa[], endereco: null }))
    : { locais: [] as LocalMapa[], endereco: null };
  const lat = Number(prop?.latitude ?? prop?.lat), lng = Number(prop?.longitude ?? prop?.lng);
  if (prop && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && !locais.some((l) => Math.abs(l.lat - lat) < 0.0005 && Math.abs(l.lng - lng) < 0.0005)) {
    locais.push({ nome: 'Ponto da propriedade (check-in)', lat, lng, origem: 'crm', quando: null, quem: null });
  }
  const nomeCliente = String(cli?.nome || prop?.nome_fantasia || prop?.razao_social || cad?.razao_social || '').trim() || null;
  const telefones = juntarTelefones(
    telefonesDoTexto(prop?.telefone, 'crm'),
    telefonesDoTexto(cli?.telefone, 'crm', cli?.nome),
    ...(pessoas as { nome: string | null; cargo: string | null; telefone: string | null }[])
      .map((p) => telefonesDoTexto(p.telefone, 'contato', [p.nome, p.cargo].filter(Boolean).join(' · '))),
    telefonesDoTexto(cad?.telefone, 'omie'),
  );
  const endProp = prop ? [prop.endereco, prop.cidade].map((s) => String(s || '').trim()).filter(Boolean).join(', ') || null : null;
  const end = endereco || endProp;
  const sup = await doSuporte({ negocioId: n.id, cod, chassi: '' });
  const m = mesclarSuporte({ telefones, endereco: end, locais }, sup.respostas) as { telefones: TelefoneQuest[]; endereco: string | null; locais: LocalMapa[] };
  return {
    cliente: nomeCliente ? { nome: nomeCliente, cod, doc: cad?.cnpj_cpf || prop?.cnpj_cpf || null } : null,
    telefones: m.telefones,
    endereco: m.endereco,
    locais: m.locais,
    falta: faltaContato({ telefones: m.telefones, temLocal: m.locais.length > 0, endereco: m.endereco }),
    pedido: sup.pedido,
  };
}

export function alvoDoNegocio(n: NegocioAlvo, contato?: ContatoQuest | null): AlvoPedido {
  return { cliente: contato?.cliente?.nome || null, cidade: n.cidade, trator: null, negocio: rotuloNegocio(n), questId: null, negocioId: n.id, vendedorId: n.vendedor_id };
}
