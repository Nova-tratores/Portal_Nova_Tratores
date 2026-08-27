// Sincroniza o LIVRO-RAZÃO de estoque da Omie (MovimentoEstoque) para a tabela
// `estoque_movimentos`. Cada movimento carrega CMC antes/depois, então o efeito no
// VALOR do estoque é exato e a soma FECHA a variação, decomposta por tipo (bucket).
// É a fonte da aba Reconciliação (substitui o snapshot, que não fechava).
//
// A chamada MovimentoEstoque NÃO aceita paginação (nPagina é rejeitado) e devolve o
// período inteiro numa resposta — validado com >150 movimentos num único retorno.
// Por isso NÃO usamos obterMovimentosProduto/paginarOmie aqui.
import { createHash } from 'node:crypto';
import { supabase } from './supabase';
import { omieRequest } from './omie';
import { type Conta } from './conta';

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const contaLow = (c: Conta): string => String(c).toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TBL = 'estoque_movimentos';
const TBL_SYNC = 'estoque_movimentos_sync';

// ---- Taxonomia de origem → bucket auditável da Reconciliação -----------------
// Vistos no razão de peças NOVA: COM(compra) VEN(venda) AJU(ajuste manual)
// REM(remessa/demonstração) CTR(frete) DVP(devolução venda) DCP(devolução compra)
// RRE(nota de entrada). Fallback por descrição + 'outro'.
export function classificarBucket(cod: string, des: string): string {
  const c = String(cod || '').toUpperCase();
  const mapa: Record<string, string> = {
    COM: 'compra', VEN: 'venda', AJU: 'ajuste', REM: 'remessa', CTR: 'frete',
    DVP: 'devolucao_venda', DCP: 'devolucao_compra', RRE: 'entrada_nf',
  };
  if (mapa[c]) return mapa[c];
  const d = String(des || '').toLowerCase();
  if (/devolu/.test(d)) return /fornecedor|compra/.test(d) ? 'devolucao_compra' : 'devolucao_venda';
  if (/compra/.test(d)) return 'compra';
  if (/venda/.test(d)) return 'venda';
  if (/remessa|demonstra|consigna/.test(d)) return 'remessa';
  if (/transporte|frete|conhecimento/.test(d)) return 'frete';
  if (/ajuste|manual|invent/.test(d)) return 'ajuste';
  if (/entrada/.test(d)) return 'entrada_nf';
  return 'outro';
}

// Extrai os 4 estados do movPeriodo (anterior/entrada/saída/atual). Igual ao
// parseMovPeriodo de ajustes/omie.ts, mas local (sem depender da paginação de lá).
function parseMovPeriodo(arr: unknown): { cmcAnterior: number; qtdeAnterior: number; entradaCMC: number; qtdeEntrada: number; qtdeSaida: number; cmcAtual: number; qtdeAtual: number } {
  const o = { cmcAnterior: 0, qtdeAnterior: 0, entradaCMC: 0, qtdeEntrada: 0, qtdeSaida: 0, cmcAtual: 0, qtdeAtual: 0 };
  if (!Array.isArray(arr)) return o;
  for (const e of arr as Array<Record<string, unknown>>) {
    const t = String((e && e.tipo) || '').toLowerCase();
    const c = num(e && e.cmcUnitario), q = num(e && e.qtde);
    if (t.includes('anterior')) { o.cmcAnterior = c; o.qtdeAnterior = q; }
    else if (t.includes('entrada')) { o.entradaCMC = c; o.qtdeEntrada = q; }
    else if (t.includes('sa') && (t.includes('da') || t.includes('ída') || t.includes('ida'))) { o.qtdeSaida = q; }
    else if (t.includes('atual')) { o.cmcAtual = c; o.qtdeAtual = q; }
  }
  return o;
}

function parseDataBR(d: string): { iso: string; ano: number; mes: number } | null {
  const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return { iso: `${m[3]}-${m[2]}-${m[1]}`, ano: +m[3], mes: +m[2] };
}

interface RazaoRow { mov_hash: string; conta_omie: string; codigo_produto: number; familia: string | null; grupo: string; data: string; ano: number; mes: number; cod_origem: string; des_origem: string; num_doc: string; qtde_anterior: number; cmc_anterior: number; qtde_atual: number; cmc_atual: number; qtde_entrada: number; qtde_saida: number; efeito: number; bucket: string; cancelado: boolean }

/** Puxa o razão de UM produto na janela e faz upsert em estoque_movimentos. */
export async function sincronizarMovimentosProduto(
  conta: Conta, codigoProduto: number, familia: string | null, grupo: string, dataDeBR: string, dataAteBR: string,
): Promise<number> {
  let data: Record<string, unknown>;
  try {
    data = await omieRequest<Record<string, unknown>>('/estoque/consulta/', 'MovimentoEstoque',
      { id_prod: Number(codigoProduto), dataInicial: dataDeBR, dataFinal: dataAteBR }, { conta, retries: 3, maxWaitMs: 60_000 });
  } catch (e) {
    const msg = String((e as Error).message || '');
    if (/n[aã]o existem movimenta|sem movimenta|registros/i.test(msg)) data = { movProduto: [] };
    else throw e;
  }
  const lista = (data.movProduto || data.movimentos || data.movEstoque || data.lista || []) as Array<Record<string, unknown>>;
  const rows: RazaoRow[] = [];
  for (const m of lista) {
    const dt = parseDataBR(String(m.dtMov || m.data || ''));
    if (!dt) continue;
    const mp = parseMovPeriodo(m.movPeriodo);
    const cod = String(m.codOrigem || m.cCodOrigem || '').toUpperCase();
    const des = String(m.desOrigem || m.cDesOrigem || m.descricao || '');
    const numDoc = String(m.numDoc || m.cNumDoc || m.docFiscal || '');
    const cancelado = m.cancelamento === 'S';
    const efeito = mp.qtdeAtual * mp.cmcAtual - mp.qtdeAnterior * mp.cmcAnterior;
    const mov_hash = createHash('sha1')
      .update([contaLow(conta), codigoProduto, dt.iso, cod, numDoc, mp.qtdeEntrada, mp.qtdeSaida, mp.cmcAnterior, mp.cmcAtual, mp.qtdeAnterior, mp.qtdeAtual].join('|'))
      .digest('hex');
    rows.push({
      mov_hash, conta_omie: contaLow(conta), codigo_produto: Number(codigoProduto), familia, grupo,
      data: dt.iso, ano: dt.ano, mes: dt.mes, cod_origem: cod, des_origem: des, num_doc: numDoc,
      qtde_anterior: mp.qtdeAnterior, cmc_anterior: mp.cmcAnterior, qtde_atual: mp.qtdeAtual, cmc_atual: mp.cmcAtual,
      qtde_entrada: mp.qtdeEntrada, qtde_saida: mp.qtdeSaida, efeito, bucket: classificarBucket(cod, des), cancelado,
    });
  }
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(TBL).upsert(rows.slice(i, i + 500), { onConflict: 'mov_hash' });
      if (error) throw new Error(error.message);
    }
  }
  await supabase.from(TBL_SYNC).upsert(
    { conta_omie: contaLow(conta), codigo_produto: Number(codigoProduto), ultima_data: parseDataBR(dataAteBR)?.iso ?? null, movimentos: rows.length, sincronizado_em: new Date().toISOString() },
    { onConflict: 'conta_omie,codigo_produto' });
  return rows.length;
}

/** Lista produtos de um grupo (por família) da conta, com paginação do PostgREST.
 *  Peça = família contém "peça"; Máquina = as demais (fora #N/D/Kit/Ativo). */
async function listarProdutos(conta: Conta, grupo: 'peca' | 'maquina'): Promise<Array<{ codigo_produto: number; familia: string }>> {
  const out: Array<{ codigo_produto: number; familia: string }> = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from('produtos').select('codigo_produto,familia_nome').eq('conta_omie', contaLow(conta));
    q = grupo === 'peca' ? q.ilike('familia_nome', '%peça%') : q.not('familia_nome', 'ilike', '%peça%');
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: number; familia_nome: string }>;
    for (const p of lote) out.push({ codigo_produto: Number(p.codigo_produto), familia: p.familia_nome });
    if (lote.length < 1000) break;
    offset += 1000;
  }
  return out;
}

/**
 * Sincroniza um LOTE de produtos de um grupo ainda não sincronizados (backfill
 * resumível via estoque_movimentos_sync). Retorna progresso p/ o chamador loopar.
 */
export async function sincronizarLote(
  conta: Conta, opts: { grupo: 'peca' | 'maquina'; dataDeBR: string; dataAteBR: string; batch?: number; sleepMs?: number },
): Promise<{ feitos: number; restantes: number; totalGrupo: number; movimentos: number }> {
  const batch = opts.batch ?? 60;
  const sleepMs = opts.sleepMs ?? 900;
  const produtos = await listarProdutos(conta, opts.grupo);
  // já sincronizados
  const feitosSet = new Set<number>();
  {
    let offset = 0;
    for (;;) {
      const { data } = await supabase.from(TBL_SYNC).select('codigo_produto').eq('conta_omie', contaLow(conta)).range(offset, offset + 999);
      const lote = (data || []) as Array<{ codigo_produto: number }>;
      lote.forEach((r) => feitosSet.add(Number(r.codigo_produto)));
      if (lote.length < 1000) break;
      offset += 1000;
    }
  }
  const faltam = produtos.filter((p) => !feitosSet.has(p.codigo_produto));
  const alvo = faltam.slice(0, batch);
  let movimentos = 0;
  for (const p of alvo) {
    try { movimentos += await sincronizarMovimentosProduto(conta, p.codigo_produto, p.familia, opts.grupo, opts.dataDeBR, opts.dataAteBR); }
    catch (e) { console.error(`[mov-sync ${conta} ${p.codigo_produto}] ${(e as Error).message}`); }
    await sleep(sleepMs);
  }
  return { feitos: alvo.length, restantes: faltam.length - alvo.length, totalGrupo: produtos.length, movimentos };
}
