// Gerador do snapshot noturno da Sugestão de Compra.
//
// Orquestra: curva ABC (persistida, 2× por conta) + série de demanda (com censura)
// + índice sazonal por Tipo + params + motor, consolidando NOVA+CASTRO por SKU.
// Grava sugestao_compra_snapshot com um snapshot_id novo. NÃO faz push Omie.
//
// Casing (memória do projeto): produtos/estoque_movimentos/views = MINÚSCULO;
// vendas_itens (calcularCurvaABC) e produto_tipo = MAIÚSCULO.
//
// NOTA v1: fornecedor preferencial vem só de item_param (manual). O backfill de
// produtos.ultima_entrada_fornecedor a partir de recebimentos_nfe exige a
// resolução de SKU do "Comprei" (cCodigo do fornecedor × nCodProduto=0) e é um
// passo dedicado à parte — não afeta as QUANTIDADES sugeridas.

import { randomUUID } from 'crypto';
import { supabase } from '@/lib/estoque/supabase';
import { calcularCurvaABC } from '@/lib/estoque/curva-abc';
import { montarSerie12m, type MovimentoCru } from './serie';
import { backfillFornecedorPreferencial } from './backfill-fornecedor';
import {
  analisarConta, consolidar, type IndiceSazonal, type ParamsConta, type Curva, type SaidaConta,
} from './motor';

const CONTAS: Array<{ low: 'nova' | 'castro'; up: 'NOVA' | 'CASTRO' }> = [
  { low: 'nova', up: 'NOVA' }, { low: 'castro', up: 'CASTRO' },
];
const CV_REGULARIDADE: Record<string, number> = { regular: 0.15, irregular: 0.30, muito_irregular: 0.50 };
const LEAD_DEFAULT = 30;
const ORDEM_CURVA: Record<Curva, number> = { A: 3, B: 2, C: 1 };

type Row = Record<string, unknown>;

async function paginar<T>(monta: (off: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []; let off = 0;
  for (;;) { const b = await monta(off); out.push(...b); if (b.length < 1000) break; off += 1000; }
  return out;
}

interface DadoConta {
  saida: SaidaConta; classe: Curva; params: ParamsConta; cp: number;
  estoqueCru: number; cmc: number; codForn: number | null;
  qtd12m: number; fat12m: number;
  descricao?: string; marca?: string; familia?: string; tipo?: string;
}

/** Gera um snapshot completo. Retorna id e contadores por conta. */
export async function gerarSnapshotSugestao(hoje: Date = new Date()): Promise<{ snapshotId: string; contadores: Record<string, number>; skus: number }> {
  const snapshotId = randomUUID();
  const bySKU = new Map<string, { nova?: DadoConta; castro?: DadoConta; sku: string }>();
  const contadores: Record<string, number> = {};

  // Passo 0: preenche o fornecedor preferencial (item_param) antes de ler os params.
  // Best-effort: falha aqui não derruba o snapshot.
  try { await backfillFornecedorPreferencial(); } catch { /* segue sem backfill */ }

  for (const { low, up } of CONTAS) {
    // 1) produtos (peça) da conta
    const produtos = await paginar(async (off) => {
      const { data } = await supabase.from('produtos')
        .select('codigo, codigo_produto, descricao, marca, familia_nome, tipo, estoque, cmc, valor_unitario')
        .eq('conta_omie', low).ilike('familia_nome', '%peç%')
        .order('codigo_produto', { ascending: true }).range(off, off + 999);
      return data ?? [];
    });
    contadores[low] = produtos.length;

    // 2) curva ABC (persistida) — classe + faturamento/qtd 12m por codigo_produto
    const curva = await calcularCurvaABC('produto', 12, '', '', up);
    const classePorCp = new Map<string, Curva>();
    const fatPorCp = new Map<string, number>();
    const qtdPorCp = new Map<string, number>();
    for (const it of curva.itens) {
      classePorCp.set(String(it.codigo), it.classe);
      fatPorCp.set(String(it.codigo), Number(it.valor_total) || 0);
      qtdPorCp.set(String(it.codigo), Number(it.quantidade) || 0);
    }

    // 3) razão cru (grupo peca) → série por item
    const movs = await paginar<MovimentoCru & { codigo_produto: number }>(async (off) => {
      const { data } = await supabase.from('estoque_movimentos')
        .select('codigo_produto, data, ano, mes, cod_origem, qtde_saida, qtde_anterior, qtde_atual')
        .eq('conta_omie', low).eq('grupo', 'peca').eq('cancelado', false)
        .order('mov_hash', { ascending: true }).range(off, off + 999);
      return (data ?? []) as (MovimentoCru & { codigo_produto: number })[];
    });
    const movsPorCp = new Map<number, MovimentoCru[]>();
    for (const m of movs) {
      const arr = movsPorCp.get(m.codigo_produto) ?? movsPorCp.set(m.codigo_produto, []).get(m.codigo_produto)!;
      arr.push(m);
    }

    // 4) tipo por item (produto_tipo é MAIÚSCULO)
    const pts = await paginar(async (off) => {
      const { data } = await supabase.from('produto_tipo').select('codigo_produto, tipo')
        .eq('conta_omie', up).order('codigo_produto', { ascending: true }).range(off, off + 999);
      return data ?? [];
    });
    const tipoPorCp = new Map<string, string>();
    for (const t of pts) if (t.tipo) tipoPorCp.set(String(t.codigo_produto), String(t.tipo));

    // 5) índice sazonal por Tipo (aplicável só com pico >= 1.5 e >= 3 anos)
    const idxRows = await paginar(async (off) => {
      const { data } = await supabase.from('vw_indice_sazonal_tipo')
        .select('tipo, mes, indice, anos_observados').eq('conta_omie', low).range(off, off + 999);
      return data ?? [];
    });
    const idxPorTipo = new Map<string, IndiceSazonal>();
    const rowsPorTipo = new Map<string, Array<{ mes: number; indice: number; anos: number }>>();
    for (const r of idxRows) {
      const arr = rowsPorTipo.get(r.tipo) ?? rowsPorTipo.set(r.tipo, []).get(r.tipo)!;
      arr.push({ mes: Number(r.mes), indice: Number(r.indice), anos: Number(r.anos_observados) });
    }
    for (const [tipo, rows] of rowsPorTipo) {
      const aplic = rows.some((r) => r.indice >= 1.5 && r.anos >= 3);
      const map: IndiceSazonal = {}; for (let m = 1; m <= 12; m++) map[m] = 1;
      if (aplic) for (const r of rows) map[r.mes] = r.indice;
      idxPorTipo.set(tipo, map);
    }

    // 6) params + lead realizado
    const itemParams = new Map<number, Record<string, unknown>>();
    for (const p of await paginar(async (off) => (await supabase.from('item_param').select('*').eq('conta_omie', low).range(off, off + 999)).data ?? []))
      itemParams.set(Number(p.codigo_produto), p);
    const fornParams = new Map<number, Record<string, unknown>>();
    for (const p of await paginar(async (off) => (await supabase.from('fornecedor_param').select('*').eq('conta_omie', low).range(off, off + 999)).data ?? []))
      fornParams.set(Number(p.codigo_fornecedor), p);
    const leadReal = new Map<number, { medio: number; sigma: number; n: number }>();
    for (const r of await paginar(async (off) => (await supabase.from('vw_lead_time_realizado').select('codigo_produto, lead_medio, lead_sigma, entregas_medidas').eq('conta_omie', low).range(off, off + 999)).data ?? []))
      leadReal.set(Number(r.codigo_produto), { medio: Number(r.lead_medio), sigma: Number(r.lead_sigma) || 0, n: Number(r.entregas_medidas) });

    // 7) por item → SaidaConta
    for (const p of produtos) {
      const cp = Number(p.codigo_produto);
      const serie = montarSerie12m(movsPorCp.get(cp) ?? [], hoje);
      const tipo = tipoPorCp.get(String(cp)) ?? 'Sem tipo';
      const indice = idxPorTipo.get(tipo) ?? neutro();
      const ip = itemParams.get(cp);
      const codForn = ip?.codigo_fornecedor_preferencial != null ? Number(ip.codigo_fornecedor_preferencial) : null;
      const fp = codForn != null ? fornParams.get(codForn) : undefined;
      const params = resolverParams(ip, fp, leadReal.get(cp));
      const estoqueCru = Number(p.estoque) || 0;
      const saida = analisarConta({ serie12m: serie, estoqueAtual: Math.max(0, estoqueCru), emTransito: 0 }, indice, hoje);
      const classe = classePorCp.get(String(cp)) ?? 'C';

      const sku = String(p.codigo || '').trim();
      if (!sku) continue;
      const bucket = bySKU.get(sku) ?? bySKU.set(sku, { sku }).get(sku)!;
      bucket[low] = {
        saida, classe, params, cp, estoqueCru, cmc: Number(p.cmc) || Number(p.valor_unitario) || 0, codForn,
        qtd12m: qtdPorCp.get(String(cp)) ?? 0, fat12m: fatPorCp.get(String(cp)) ?? 0,
        descricao: p.descricao, marca: p.marca, familia: p.familia_nome, tipo,
      };
    }
  }

  // 8) consolidar por SKU + montar linhas
  const linhas: Row[] = [];
  for (const { nova, castro, sku } of bySKU.values()) {
    const presentes = [nova, castro].filter((x): x is DadoConta => !!x);
    if (presentes.length === 0) continue;
    const lider = nova?.codForn != null ? nova : castro?.codForn != null ? castro : (nova ?? castro)!;
    const curva = presentes.reduce<Curva>((best, d) => (ORDEM_CURVA[d.classe] > ORDEM_CURVA[best] ? d.classe : best), 'C');
    const c = consolidar({ nova: nova?.saida, castro: castro?.saida, curva, params: lider.params, hoje });

    const cmdPool = c.cmd;
    const indice45 = cmdPool > 0 ? c.demanda45d / (cmdPool * 45) : 1;
    const ref = nova ?? castro!;
    linhas.push({
      snapshot_id: snapshotId, gerado_em: hoje.toISOString(), sku,
      codigo_produto_nova: nova?.cp ?? null, codigo_produto_castro: castro?.cp ?? null,
      descricao: ref.descricao, marca: ref.marca, familia: ref.familia, tipo: ref.tipo,
      codigo_fornecedor: lider.codForn,
      estoque_nova: nova?.estoqueCru ?? null, estoque_castro: castro?.estoqueCru ?? null,
      cmd_nova: nova ? round(nova.saida.cmdDiario) : null, cmd_castro: castro ? round(castro.saida.cmdDiario) : null,
      dias_ruptura_nova: diasRuptura(nova), dias_ruptura_castro: diasRuptura(castro),
      curva, curva_calculada_em: hoje.toISOString(), frequencia: c.frequencia,
      meses_com_saida_12m: c.mesesComSaida, regime: c.regime,
      cmd: round(c.cmd), sigma_demanda: round(c.sigmaDemanda), indice_sazonal_45d: round(indice45),
      demanda_45d: round(c.demanda45d), revisoes_45d: 0,
      dias_ruptura_12m: presentes.reduce((a, d) => a + d.saida.diasRuptura12m, 0),
      fator_censura: round(presentes.reduce((a, d) => a + d.saida.fatorCensuraMedio, 0) / presentes.length),
      lead_time_usado: lider.params.leadTimeUsado, lead_time_origem: lider.params.leadTimeOrigem,
      sigma_lead: round(lider.params.sigmaLead), entregas_medidas: null,
      nivel_servico: c.nivelServico, estoque_seguranca: round(c.estoqueSeguranca),
      minimo_efetivo: round(c.minimoEfetivo), minimo_origem: c.minimoOrigem,
      estoque_atual: round(c.estoqueAtual), em_transito: round(c.emTransito),
      prev_30: round(c.prev30), prev_60: round(c.prev60), prev_90: round(c.prev90),
      qtd_sugerida_bruta: round(c.qtdSugeridaBruta), qtd_sugerida: c.qtdSugerida,
      valor_estimado: round(c.qtdSugerida * (lider.cmc || 0)), alerta: c.alerta,
      qtd_12m: round(presentes.reduce((a, d) => a + d.qtd12m, 0)),
      faturamento_12m: round(presentes.reduce((a, d) => a + d.fat12m, 0)),
    });
  }

  // 9) gravar em lotes + retenção 90 dias
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('sugestao_compra_snapshot').insert(linhas.slice(i, i + 500));
    if (error) throw new Error(`insert snapshot: ${error.message}`);
  }
  const corte = new Date(hoje.getTime() - 90 * 864e5).toISOString();
  await supabase.from('sugestao_compra_snapshot').delete().lt('gerado_em', corte);

  return { snapshotId, contadores, skus: linhas.length };
}

function neutro(): IndiceSazonal { const m: IndiceSazonal = {}; for (let i = 1; i <= 12; i++) m[i] = 1; return m; }

function resolverParams(ip: Record<string, unknown> | undefined, fp: Record<string, unknown> | undefined, real?: { medio: number; sigma: number; n: number }): ParamsConta {
  const regularidade = (fp?.regularidade as ParamsConta['regularidade']) ?? 'regular';
  const leadDeclarado = num(ip?.lead_time_override) ?? num(fp?.lead_time_declarado) ?? LEAD_DEFAULT;
  const medido = real && real.n >= 8;
  const leadTimeUsado = medido ? Math.round(real!.medio) : leadDeclarado;
  const sigmaLead = medido ? real!.sigma : leadDeclarado * (CV_REGULARIDADE[regularidade] ?? 0.15);
  return {
    multiploEmbalagem: num(ip?.multiplo_embalagem) ?? 1,
    minimoManual: num(ip?.minimo_manual),
    minimoManualValidade: (ip?.minimo_manual_validade as string) ?? null,
    critico: ip?.critico === true,
    sobEncomenda: ip?.sob_encomenda === true,
    leadTimeUsado, leadTimeOrigem: medido ? 'medido' : 'declarado',
    sigmaLead, cicloDias: num(fp?.ciclo_dias) ?? 15, regularidade,
    nivelServicoOverride: pickNS(ip, fp),
  };
}

// override de NS por classe não é resolvido aqui (depende da curva); deixa null e
// o motor aplica a matriz. (fornecedor_param.nivel_servico_* é um TODO de refino.)
function pickNS(_ip?: Record<string, unknown>, _fp?: Record<string, unknown>): number | null { return null; }

function diasRuptura(d?: DadoConta): number | null {
  if (!d) return null;
  const cmd = d.saida.cmdDiario;
  return cmd > 0 ? round(Math.max(0, d.estoqueCru) / cmd) : null;
}
function num(v: unknown): number | null { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function round(n: number): number { return Math.round(n * 100) / 100; }
