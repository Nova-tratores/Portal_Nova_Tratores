// Devolução em garantia ↔ garantia — servidor (26/11/2026). Regras em retorno-vinculo.ts.
// Liga uma devolução (de qualquer caminho: Recebimentos ou garantia) a uma ou mais garantias,
// fecha a pendência "Devolução de peças" de cada uma, ou registra "sem garantia no portal".
// Devolução faturada sem nenhum dos dois fica pendente: aviso na tela Garantias + sino semanal.
import { supabase } from '@/lib/ajustes/supabase';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import { baixarNaGarantia, colunaFaltando, tabelaFaltando } from './retorno-remessa-server';
import {
  garantiasDaFicha, situacaoVinculo, sugerirGarantias, tituloLembrete, validarMotivoSemGarantia,
  type GarantiaCandidata, type ItemDevolvido, type Sugestao,
} from './retorno-vinculo';

const TBL = 'garantia_retornos';
const MSG_MIGRACAO = 'Falta aplicar sql/garantia-retornos-vinculo.sql no banco.';
const sem0 = (s: unknown) => String(s ?? '').replace(/^0+(?=\d)/, '');

const COLS = 'id, conta_omie, id_receb, numero_nfe, fornecedor, status, nf_numero, itens, valor_total, user_nome, criado_em, faturado_em, garantia_id';
const COLS_VINC = `${COLS}, garantia_ids, sem_garantia_motivo, sem_garantia_por, sem_garantia_em, vinculo_alertado_em`;

export interface Ficha {
  id: string; conta_omie: string; id_receb: number; numero_nfe: string | null; fornecedor: string | null;
  status: string; nf_numero: string | null; itens: Array<{ codigo?: string | null; descricao?: string | null; qtd?: number }>;
  valor_total: number | null; user_nome: string | null; criado_em: string; faturado_em: string | null;
  garantia_id: string | null; garantia_ids?: string[] | null; sem_garantia_motivo?: string | null;
  sem_garantia_por?: string | null; sem_garantia_em?: string | null; vinculo_alertado_em?: string | null;
}

/** se a migration do vínculo já rodou (cacheado por processo; relê a cada 5 min) */
let temColunas: { v: boolean; em: number } | null = null;
async function colunasNovas(): Promise<boolean> {
  if (temColunas && Date.now() - temColunas.em < 300000) return temColunas.v;
  const { error } = await supabase.from(TBL).select('garantia_ids').limit(1);
  temColunas = { v: !colunaFaltando(error), em: Date.now() };
  return temColunas.v;
}

async function lerFicha(id: string): Promise<Ficha | null> {
  const nova = await colunasNovas();
  const { data, error } = await supabase.from(TBL).select(nova ? COLS_VINC : COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(tabelaFaltando(error) ? 'Falta aplicar sql/garantia-retorno-remessa.sql no banco.' : error.message);
  return (data as unknown as Ficha) || null;
}

// ── candidatas e sugestões ──────────────────────────────────────────────────

let cacheCand: { em: number; lista: GarantiaCandidata[] } | null = null;
async function candidatas(): Promise<GarantiaCandidata[]> {
  if (cacheCand && Date.now() - cacheCand.em < 120000) return cacheCand.lista;
  const desde = new Date(Date.now() - 730 * 86400000).toISOString();
  const { data, error } = await supabase.from('garantias')
    .select('id, numero, numero_externo, status, cliente, id_ordem, devolucao_status, created_at, montadora:garantia_montadoras(nome), pecas:garantia_pecas(cod_produto, descricao)')
    .gte('created_at', desde).order('created_at', { ascending: false }).limit(3000);
  if (error) throw new Error(error.message);
  const lista = (data || []).map((g) => ({
    ...(g as unknown as GarantiaCandidata),
    montadora: ((g as { montadora?: { nome?: string } | null }).montadora?.nome) || null,
    pecas: ((g as { pecas?: GarantiaCandidata['pecas'] }).pecas) || [],
  }));
  cacheCand = { em: Date.now(), lista };
  return lista;
}

export async function sugestoesParaItens(itens: ItemDevolvido[], fornecedor: string | null): Promise<Sugestao[]> {
  if (!itens.length) return [];
  return sugerirGarantias(itens, fornecedor, await candidatas());
}

/** nº das garantias ligadas */
async function numeros(ids: string[]): Promise<Array<{ id: string; numero: string; devolucaoStatus: string | null; cliente: string | null }>> {
  if (!ids.length) return [];
  const { data } = await supabase.from('garantias').select('id, numero, devolucao_status, cliente').in('id', ids);
  const m = new Map((data || []).map((g) => [g.id as string, g]));
  return ids.map((id) => {
    const g = m.get(id) as { numero?: string; devolucao_status?: string | null; cliente?: string | null } | undefined;
    return { id, numero: g?.numero || '?', devolucaoStatus: g?.devolucao_status ?? null, cliente: g?.cliente ?? null };
  });
}

function resumo(f: Ficha) {
  return {
    id: f.id, conta: f.conta_omie, idReceb: Number(f.id_receb), nfFabrica: sem0(f.numero_nfe), fornecedor: f.fornecedor,
    nf: f.nf_numero, status: f.status, valor: f.valor_total, quem: f.user_nome, criadoEm: f.criado_em, faturadoEm: f.faturado_em,
    itens: (f.itens || []).map((i) => ({ codigo: i.codigo || null, descricao: i.descricao || null, qtd: Number(i.qtd) || 0 })),
    vinculo: situacaoVinculo(f), semGarantiaMotivo: f.sem_garantia_motivo || null, semGarantiaPor: f.sem_garantia_por || null,
    semGarantiaEm: f.sem_garantia_em || null,
  };
}

/** a janela "Ligar a uma garantia" de uma devolução */
export async function vinculoDaFicha(fichaId: string) {
  const f = await lerFicha(fichaId);
  if (!f) return { erro: 'Devolução não encontrada.' };
  const ligadas = await numeros(garantiasDaFicha(f));
  const sugestoes = (await sugestoesParaItens(f.itens || [], f.fornecedor)).filter((s) => !ligadas.some((l) => l.id === s.id));
  return { devolucao: resumo(f), ligadas, sugestoes, migracaoFaltando: !(await colunasNovas()) };
}

/** busca manual de garantia (nº GAR, SG, OS, cliente, chassi) */
export async function buscarGarantias(q: string) {
  const t = q.trim().replace(/[%,()]/g, ' ').trim();
  if (t.length < 2) return [];
  const { data } = await supabase.from('garantias')
    .select('id, numero, numero_externo, status, cliente, id_ordem, devolucao_status, chassis')
    .or(['numero', 'numero_externo', 'cliente', 'id_ordem', 'chassis'].map((c) => `${c}.ilike.%${t}%`).join(','))
    .order('created_at', { ascending: false }).limit(15);
  return (data || []).map((g) => ({
    id: g.id as string, numero: g.numero as string, numeroExterno: (g.numero_externo as string) || null, status: g.status as string,
    cliente: (g.cliente as string) || null, idOrdem: (g.id_ordem as string) || null, devolucaoStatus: (g.devolucao_status as string) || null,
  }));
}

// ── ligar / sem garantia ────────────────────────────────────────────────────

/** define as garantias da devolução (substitui a lista). Faturada: dá baixa nas que entraram. */
export async function ligarGarantias(fichaId: string, idsNovos: string[], ator: string) {
  const f = await lerFicha(fichaId);
  if (!f) return { ok: false, erro: 'Devolução não encontrada.' };
  const ids = [...new Set(idsNovos.filter(Boolean))];
  if (ids.length) {
    const { data } = await supabase.from('garantias').select('id').in('id', ids);
    if ((data || []).length !== ids.length) return { ok: false, erro: 'Garantia não encontrada.' };
  }
  const antes = garantiasDaFicha(f);
  const adicionadas = ids.filter((id) => !antes.includes(id));
  const removidas = antes.filter((id) => !ids.includes(id));
  const agora = new Date().toISOString();
  if (await colunasNovas()) {
    const { error } = await supabase.from(TBL).update({
      garantia_ids: ids, garantia_id: ids[0] || null, atualizado_em: agora,
      ...(ids.length ? { sem_garantia_motivo: null, sem_garantia_por: null, sem_garantia_em: null } : {}),
    }).eq('id', fichaId);
    if (error) return { ok: false, erro: error.message };
  } else {
    if (ids.length > 1) return { ok: false, erro: `Para ligar a mais de uma garantia, ${MSG_MIGRACAO.toLowerCase()}`, migracaoFaltando: true };
    const { error } = await supabase.from(TBL).update({ garantia_id: ids[0] || null, atualizado_em: agora }).eq('id', fichaId);
    if (error) return { ok: false, erro: error.message };
  }
  const nfTxt = f.nf_numero ? `NF ${f.nf_numero}` : 'devolução';
  if (f.status === 'faturada') {
    for (const id of adicionadas) await baixarNaGarantia(id, f.nf_numero, f.numero_nfe, ator).catch(() => {});
  } else {
    for (const id of adicionadas) await registrarEvento(id, { tipo: 'devolucao_ligada', ator, detalhe: `Ligada à devolução em garantia (retorno da NF ${sem0(f.numero_nfe)} da fábrica); a pendência fecha quando a NF-e for autorizada.` });
  }
  for (const id of removidas) await registrarEvento(id, { tipo: 'devolucao_desligada', ator, detalhe: `Desligada da ${nfTxt} de devolução (retorno da NF ${sem0(f.numero_nfe)} da fábrica). O status da devolução da garantia não foi mudado.` });
  return { ok: true, adicionadas: (await numeros(adicionadas)).map((g) => g.numero), removidas: (await numeros(removidas)).map((g) => g.numero) };
}

/** a devolução não tem garantia no portal (peça de estoque, garantia direto com a fábrica…) */
export async function marcarSemGarantia(fichaId: string, motivo: string, ator: string, desfazer = false) {
  if (!(await colunasNovas())) return { ok: false, erro: MSG_MIGRACAO, migracaoFaltando: true };
  const f = await lerFicha(fichaId);
  if (!f) return { ok: false, erro: 'Devolução não encontrada.' };
  if (desfazer) {
    await supabase.from(TBL).update({ sem_garantia_motivo: null, sem_garantia_por: null, sem_garantia_em: null }).eq('id', fichaId);
    return { ok: true };
  }
  if (garantiasDaFicha(f).length) return { ok: false, erro: 'Esta devolução já está ligada a uma garantia. Desligue antes.' };
  const e = validarMotivoSemGarantia(motivo);
  if (e) return { ok: false, erro: e };
  const { error } = await supabase.from(TBL).update({
    sem_garantia_motivo: motivo.trim().slice(0, 500), sem_garantia_por: ator, sem_garantia_em: new Date().toISOString(),
  }).eq('id', fichaId);
  return error ? { ok: false, erro: error.message } : { ok: true };
}

// ── pendências: tela Garantias e lembrete ───────────────────────────────────

async function lerPendentes(): Promise<Ficha[]> {
  const nova = await colunasNovas();
  let q = supabase.from(TBL).select(nova ? COLS_VINC : COLS).eq('status', 'faturada').order('criado_em', { ascending: false }).limit(300);
  q = nova ? q.is('sem_garantia_em', null) : q.is('garantia_id', null);
  const { data, error } = await q;
  if (error) {
    if (tabelaFaltando(error)) return [];
    throw new Error(error.message);
  }
  return ((data || []) as unknown as Ficha[]).filter((f) => situacaoVinculo(f) === 'pendente');
}

/** devoluções faturadas sem garantia ligada, com as sugestões de cada uma */
export async function pendentesDeVinculo() {
  const lista = await lerPendentes();
  const out = [];
  for (const f of lista) out.push({ ...resumo(f), sugestoes: await sugestoesParaItens(f.itens || [], f.fornecedor) });
  return { pendentes: out, migracaoFaltando: !(await colunasNovas()) };
}

/** lembrete do sino (cron diário das devoluções): um aviso por rodada, cada devolução no máximo a cada 7 dias */
export async function lembrarVinculosPendentes(hoje: string, ha6dias: string) {
  if (!(await colunasNovas())) return { avisadas: 0, pulado: 'migracao' };
  const lista = (await lerPendentes()).filter((f) => !f.vinculo_alertado_em || f.vinculo_alertado_em < ha6dias);
  if (!lista.length) return { avisadas: 0 };
  const nfs = lista.slice(0, 6).map((f) => `NF ${f.nf_numero || '?'}${f.fornecedor ? ` (${f.fornecedor.split(/\s+/)[0]})` : ''}`).join(', ');
  await notificarGarantistas({
    titulo: tituloLembrete(lista.length),
    descricao: `${nfs}${lista.length > 6 ? '…' : ''}. Ligue cada uma à garantia (fecha a pendência de devolução) ou marque que não tem garantia no portal.`,
    link: '/garantias?retornos=1',
  });
  await supabase.from(TBL).update({ vinculo_alertado_em: hoje }).in('id', lista.map((f) => f.id));
  return { avisadas: lista.length };
}
