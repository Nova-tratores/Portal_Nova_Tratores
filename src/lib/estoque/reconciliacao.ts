// Reconciliação de estoque a partir do LIVRO-RAZÃO (tabela estoque_movimentos).
// Cada movimento tem efeito EXATO no valor do estoque; a soma por mês FECHA a
// variação, decomposta por bucket (compra/venda/ajuste/remessa/frete/devoluções).
// O estoque de cada mês é derivado do próprio razão, ancorado no estoque REAL de
// hoje (Σ produtos.valor_estoque) — não usa o snapshot (que não fechava).
import { supabase } from './supabase';
import { type Conta } from './conta';

const contaLow = (c: Conta): string => String(c).toLowerCase();
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Ordem/labels dos buckets (entradas primeiro, depois saídas, depois ajustes).
export const BUCKETS: Array<{ key: string; label: string; sinal: 1 | -1 }> = [
  { key: 'compra', label: 'Compra', sinal: 1 },
  { key: 'entrada_nf', label: 'Entrada NF', sinal: 1 },
  { key: 'devolucao_venda', label: 'Devol. venda', sinal: 1 },
  { key: 'frete', label: 'Frete', sinal: 1 },
  { key: 'venda', label: 'Venda (COGS)', sinal: -1 },
  { key: 'remessa', label: 'Remessa', sinal: -1 },
  { key: 'devolucao_compra', label: 'Devol. compra', sinal: -1 },
  { key: 'ajuste', label: 'Ajuste', sinal: 1 },
  { key: 'outro', label: 'Outro', sinal: 1 },
];

export interface PontoRecon { periodo: string; ano: number; mes: number; estoqueFim: number | null; deltaEstoque: number; [bucket: string]: number | string | null }
export interface ReconResult { pontos: PontoRecon[]; buckets: string[]; estoqueAtual: number; totalMovimentos: number }

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Estoque atual (R$) do grupo, direto de `produtos` — âncora da série. */
async function estoqueAtualGrupo(conta: Conta, grupo: 'peca' | 'maquina'): Promise<number> {
  let total = 0, offset = 0;
  for (;;) {
    let q = supabase.from('produtos').select('valor_estoque').eq('conta_omie', contaLow(conta));
    q = grupo === 'peca' ? q.ilike('familia_nome', '%peça%') : q.not('familia_nome', 'ilike', '%peça%');
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ valor_estoque: number }>;
    for (const p of lote) total += num(p.valor_estoque);
    if (lote.length < 1000) break;
    offset += 1000;
  }
  return total;
}

/** Agrega efeito por (ano,mes,bucket) do razão, para o grupo/conta. */
async function agregarRazao(conta: Conta, grupo: 'peca' | 'maquina'): Promise<Map<string, Map<string, number>>> {
  const porMes = new Map<string, Map<string, number>>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.from('estoque_movimentos')
      .select('ano,mes,bucket,efeito')
      .eq('conta_omie', contaLow(conta)).eq('grupo', grupo).eq('cancelado', false)
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ ano: number; mes: number; bucket: string; efeito: number }>;
    for (const r of lote) {
      const k = `${r.ano}-${r.mes}`;
      if (!porMes.has(k)) porMes.set(k, new Map());
      const mm = porMes.get(k)!;
      const b = r.bucket || 'outro';
      mm.set(b, (mm.get(b) || 0) + num(r.efeito));
    }
    if (lote.length < 1000) break;
    offset += 1000;
  }
  return porMes;
}

/**
 * Série mensal da Reconciliação (razão) para os `meses` pedidos (ordenados asc).
 * Estoque derivado do razão, ancorado no estoque real de hoje (último mês = âncora).
 */
export async function reconciliacaoLedger(
  meses: Array<{ ano: number; mes: number }>, conta: Conta, grupo: 'peca' | 'maquina',
): Promise<ReconResult> {
  const [estoqueAtual, porMes] = await Promise.all([estoqueAtualGrupo(conta, grupo), agregarRazao(conta, grupo)]);

  const bucketsPresentes = new Set<string>();
  for (const mm of porMes.values()) for (const b of mm.keys()) bucketsPresentes.add(b);
  const buckets = BUCKETS.map((b) => b.key).filter((k) => bucketsPresentes.has(k));

  // Δ e decomposição por mês.
  const pontos: PontoRecon[] = meses.map((m) => {
    const mm = porMes.get(`${m.ano}-${m.mes}`) || new Map<string, number>();
    let delta = 0;
    const p: PontoRecon = { periodo: `${MESES_ABREV[m.mes - 1]}/${String(m.ano).slice(2)}`, ano: m.ano, mes: m.mes, estoqueFim: null, deltaEstoque: 0 };
    for (const b of buckets) { const v = Math.round(mm.get(b) || 0); p[b] = v; delta += v; }
    p.deltaEstoque = Math.round(delta);
    return p;
  });

  // Estoque (fim) derivado do razão: âncora no último mês = estoque real de hoje,
  // e para trás: estoqueFim(M-1) = estoqueFim(M) − Δ(M).
  for (let i = pontos.length - 1; i >= 0; i--) {
    if (i === pontos.length - 1) pontos[i].estoqueFim = Math.round(estoqueAtual);
    else pontos[i].estoqueFim = Math.round((pontos[i + 1].estoqueFim as number) - (pontos[i + 1].deltaEstoque as number));
  }

  return { pontos, buckets, estoqueAtual: Math.round(estoqueAtual), totalMovimentos: porMes.size };
}

/**
 * Valor de estoque (R$) por mês reconstruído do razão, para uso do Gráfico Mensal
 * (mesma base da aba Reconciliação). Âncora = estoque real de hoje; para trás,
 * subtrai o Δ de cada mês. `temDados=false` quando não há movimentos do grupo no
 * razão (aí o chamador deve cair no snapshot). `meses` em ordem ascendente.
 */
export async function estoqueLedgerPorMes(
  meses: Array<{ ano: number; mes: number }>, conta: Conta, grupo: 'peca' | 'maquina',
): Promise<{ valorPorMes: Map<string, number>; temDados: boolean }> {
  const [estoqueAtual, porMes] = await Promise.all([estoqueAtualGrupo(conta, grupo), agregarRazao(conta, grupo)]);
  const deltas = meses.map((m) => {
    const mm = porMes.get(`${m.ano}-${m.mes}`); if (!mm) return 0;
    let d = 0; for (const v of mm.values()) d += v; return Math.round(d);
  });
  const valores = new Array<number>(meses.length);
  for (let i = meses.length - 1; i >= 0; i--) {
    valores[i] = i === meses.length - 1 ? Math.round(estoqueAtual) : valores[i + 1] - deltas[i + 1];
  }
  const valorPorMes = new Map<string, number>();
  meses.forEach((m, i) => valorPorMes.set(`${m.ano}-${m.mes}`, valores[i]));
  return { valorPorMes, temDados: porMes.size > 0 };
}

export interface DetalheItem { codigo_produto: number; sku: string; descricao: string; movimentos: number; qtde: number; efeito: number }
export interface DetalheResult { itens: DetalheItem[]; total: number; somaEfeito: number; bucket: string }

/**
 * Composição de UMA célula (conta/grupo/ano/mês/bucket): os movimentos do razão
 * que somam aquele valor, agregados por produto (com SKU/descrição). Se bucket
 * vazio, traz TODOS os buckets do mês (= Δ Estoque do mês).
 */
export async function detalheBucket(
  conta: Conta, grupo: 'peca' | 'maquina', ano: number, mes: number, bucket: string,
): Promise<DetalheResult> {
  const porProduto = new Map<number, { mov: number; qtde: number; efeito: number }>();
  let offset = 0;
  for (;;) {
    let q = supabase.from('estoque_movimentos')
      .select('codigo_produto,efeito,qtde_entrada,qtde_saida')
      .eq('conta_omie', contaLow(conta)).eq('grupo', grupo).eq('ano', ano).eq('mes', mes).eq('cancelado', false);
    if (bucket) q = q.eq('bucket', bucket);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: number; efeito: number; qtde_entrada: number; qtde_saida: number }>;
    for (const r of lote) {
      const cur = porProduto.get(r.codigo_produto) || { mov: 0, qtde: 0, efeito: 0 };
      cur.mov += 1;
      cur.qtde += num(r.qtde_entrada) - num(r.qtde_saida);
      cur.efeito += num(r.efeito);
      porProduto.set(r.codigo_produto, cur);
    }
    if (lote.length < 1000) break;
    offset += 1000;
  }
  // Rótulos (SKU/descrição) via produtos.
  const ids = [...porProduto.keys()];
  const info = new Map<number, { sku: string; descricao: string }>();
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data } = await supabase.from('produtos').select('codigo_produto,codigo,descricao').in('codigo_produto', chunk);
    for (const p of (data || []) as Array<{ codigo_produto: number; codigo: string; descricao: string }>) {
      info.set(Number(p.codigo_produto), { sku: p.codigo || '', descricao: p.descricao || '' });
    }
  }
  const itens: DetalheItem[] = ids.map((id) => {
    const a = porProduto.get(id)!;
    const inf = info.get(id) || { sku: '', descricao: '' };
    return { codigo_produto: id, sku: inf.sku, descricao: inf.descricao, movimentos: a.mov, qtde: Math.round(a.qtde * 100) / 100, efeito: Math.round(a.efeito) };
  }).sort((x, y) => Math.abs(y.efeito) - Math.abs(x.efeito));
  const somaEfeito = itens.reduce((s, it) => s + it.efeito, 0);
  return { itens, total: itens.length, somaEfeito, bucket };
}
