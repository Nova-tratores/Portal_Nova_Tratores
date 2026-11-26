/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// REQUISIÇÕES DA CAMPANHA (25/11/2026, José: "já tem que mostrar todas as requisições do grupo dessa campanha,
// mostra as fases da req, se tiver valor já vai contando ali").
//
// Fonte das requisições: o GRUPO da campanha (requisicao_grupos.mkt_acao_id) + as já ligadas como custo.
// A soma NÃO é paralela: cada requisição do grupo vira (sozinha) um mkt_custos com vinculo 'requisicao',
// e o Investimento/ROI continuam lendo só mkt_custos — a mesma requisição nunca conta duas vezes
// (o índice único ux_mkt_custos_doc garante).
//   fase "financeiro"          → custo Confirmado
//   pedido/completa/aguardando → custo Previsto (vira Confirmado quando a req chega no financeiro)
//   recusada/lixeira           → não entra; se já tinha custo, ele vira Cancelado
// =============================================================================
import { db } from './db';
import { parseValorMisto } from './custos';
import { custoDaRequisicao, detalheDaRequisicao, nomesDosSolicitantes, nomeSolicitante } from './requisicao-custo';

/** Fases na ordem do Kanban de Requisições (src/components/requisicoes/Kanban.tsx). */
export const FASES_REQ = [
  { id: 'pedido', label: 'Pedido realizado' },
  { id: 'completa', label: 'Aguardando autorização' },
  { id: 'aguardando', label: 'Aguardando nota' },
  { id: 'financeiro', label: 'Enviado ao financeiro' },
] as const;
export const FORA = new Set(['recusada', 'lixeira']);

const statusDoCusto = (fase: string | null): 'confirmado' | 'previsto' | null =>
  FORA.has(String(fase)) ? null : fase === 'financeiro' ? 'confirmado' : 'previsto';

export type ReqDaCampanha = {
  id: number; titulo: string; fase: string | null; valor: number; solicitante: string | null;
  solicitante_bruto: string | null; fornecedor: string | null; criada_em: string | null;
  no_grupo: boolean; custo_id: string | null; custo_status: string | null;
};

/** Lê o grupo + os custos, cria/atualiza os custos que faltam e devolve a lista pronta. */
export async function reqsDaCampanha(acaoId: string, autor: { id: string; nome: string }): Promise<{ reqs: ReqDaCampanha[]; grupoId: number | null; mudou: boolean }> {
  const { data: grupos } = await db.from('requisicao_grupos').select('id').eq('mkt_acao_id', acaoId);
  const gIds = (grupos ?? []).map((g: any) => g.id);
  const { data: membros } = gIds.length
    ? await db.from('requisicao_grupo_membros').select('req_id').in('grupo_id', gIds)
    : { data: [] as any[] };
  const doGrupo = new Set((membros ?? []).map((m: any) => Number(m.req_id)));

  const { data: custos } = await db.from('mkt_custos').select('id, vinculo_ref, status')
    .eq('acao_id', acaoId).eq('vinculo_tipo', 'requisicao');
  const custoPorReq = new Map<number, { id: string; status: string }>();
  for (const c of custos ?? []) custoPorReq.set(Number(c.vinculo_ref), { id: c.id, status: c.status });

  const ids = [...new Set([...doGrupo, ...custoPorReq.keys()])].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { reqs: [], grupoId: gIds[0] ?? null, mudou: false };

  const { data: linhas, error } = await db.from('Requisicao')
    .select('id, titulo, status, valor_despeza, solicitante, fornecedor, created_at').in('id', ids);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const nomes = await nomesDosSolicitantes((linhas ?? []).map((r: any) => r.solicitante));

  let mudou = false;
  const reqs: ReqDaCampanha[] = [];
  for (const r of linhas ?? []) {
    const fase = r.status ?? null;
    const alvo = statusDoCusto(fase);
    let custo = custoPorReq.get(r.id) ?? null;

    if (!custo && doGrupo.has(r.id) && alvo) {
      // entrou no grupo e ainda não é custo → lança sozinho
      const d = await detalheDaRequisicao(r.id);
      if (d) {
        const { data: novo, error: eIns } = await db.from('mkt_custos').insert([{
          ...custoDaRequisicao(d), status: alvo, acao_id: acaoId,
          criado_por_id: autor.id, criado_por_nome: `${autor.nome} (grupo da campanha)`,
        }]).select('id, status').single();
        if (!eIns && novo) { custo = { id: novo.id, status: novo.status }; mudou = true; }
        else if (eIns && eIns.code !== '23505') console.warn('[marketing] custo automático:', eIns.message);
      }
    } else if (custo) {
      // a requisição andou: previsto → confirmado; recusada/lixeira → cancelado (nunca rebaixa um confirmado manual)
      const novoStatus = alvo === null ? 'cancelado' : alvo === 'confirmado' && custo.status === 'previsto' ? 'confirmado' : null;
      if (novoStatus && novoStatus !== custo.status) {
        const { error: eUp } = await db.from('mkt_custos').update({ status: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', custo.id);
        if (!eUp) { custo = { ...custo, status: novoStatus }; mudou = true; }
      }
    }

    reqs.push({
      id: r.id, titulo: r.titulo || `Requisição #${r.id}`, fase, valor: parseValorMisto(r.valor_despeza) ?? 0,
      solicitante: nomeSolicitante(r.solicitante, nomes), solicitante_bruto: r.solicitante ?? null,
      fornecedor: r.fornecedor ?? null, criada_em: r.created_at ?? null,
      no_grupo: doGrupo.has(r.id), custo_id: custo?.id ?? null, custo_status: custo?.status ?? null,
    });
  }
  reqs.sort((a, b) => String(b.criada_em || '').localeCompare(String(a.criada_em || '')));
  return { reqs, grupoId: gIds[0] ?? null, mudou };
}
