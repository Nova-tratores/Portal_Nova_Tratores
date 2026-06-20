/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Inventário rotativo CROSS-CONTA (curva ABC). Portado de src/inventario.js.
//
// O estoque físico é UM SÓ, compartilhado por NOVA e CASTRO; o inventário é
// GLOBAL, identificado pelo SKU (código da peça). Recálculo da curva e geração
// de ciclo são WORKER-READY (estado em ajustes_jobs; conta=null pois é global).
// ============================================================================

import { getContasOmie, labelConta } from './conta';
import { getConfig } from './config';
import { hoje, addMeses, addDias, fmtBR, fmtISO, parseAnyDate } from './dates';
import { num } from './utils';
import { supabase } from './supabase';
import { httpErr } from './cmc';
import { mapaFamiliaProduto, listarNotasSaida, obterPosicaoEstoqueBulk, obterPosicaoEstoqueProduto } from './omie';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando } from './jobs';

function hojeISO(): string {
  return fmtISO(hoje());
}
function refMesAtual(): string {
  const d = hoje();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---- Parâmetros (env, com defaults) ----
export function getFrequenciasABC(): { A: number; B: number; C: number } {
  const a = parseInt(process.env.INV_FREQ_A || '', 10);
  const b = parseInt(process.env.INV_FREQ_B || '', 10);
  const c = parseInt(process.env.INV_FREQ_C || '', 10);
  return {
    A: Number.isInteger(a) && a > 0 ? a : 30,
    B: Number.isInteger(b) && b > 0 ? b : 90,
    C: Number.isInteger(c) && c > 0 ? c : 180,
  };
}
export function getCapacidadeDiaria(): number {
  const cap = parseInt(process.env.INV_CAP_DIARIA || '', 10);
  return Number.isInteger(cap) && cap > 0 ? cap : 6;
}
export function getCapacidadePadrao(): number {
  const cap = parseInt(process.env.INV_CAPACIDADE_CICLO || '', 10);
  return Number.isInteger(cap) && cap > 0 ? cap : getCapacidadeDiaria();
}
export function getLimitesABC(): { limiteA: number; limiteB: number } {
  const a = parseFloat(process.env.INV_ABC_LIMITE_A || '');
  const b = parseFloat(process.env.INV_ABC_LIMITE_B || '');
  return {
    limiteA: isFinite(a) && a > 0 && a < 1 ? a : 0.8,
    limiteB: isFinite(b) && b > 0 && b < 1 ? b : 0.95,
  };
}
export function getTolerancia(): { pct: number; valor: number } {
  const pct = parseFloat(process.env.INV_TOL_PCT || '');
  const valor = parseFloat(process.env.INV_TOL_VALOR || '');
  return { pct: isFinite(pct) && pct > 0 ? pct : 0, valor: isFinite(valor) && valor > 0 ? valor : 0 };
}
export function frequenciaDias(classe: string, freqs?: any): number {
  const f = freqs || getFrequenciasABC();
  return f[classe] != null ? f[classe] : f.C;
}
export function excedeTolerancia(divergencia: number, saldoFreeze: number, cmc: number, tol?: any): boolean {
  const div = num(divergencia);
  if (div === 0) return false;
  const t = tol || getTolerancia();
  if (t.pct <= 0 && t.valor <= 0) return true;
  const absDiv = Math.abs(div);
  const base = Math.abs(num(saldoFreeze));
  const pct = base > 0 ? absDiv / base : 1;
  const valorDiv = absDiv * num(cmc);
  let exc = false;
  if (t.pct > 0 && pct > t.pct) exc = true;
  if (t.valor > 0 && valorDiv > t.valor) exc = true;
  return exc;
}

const ORDEM_CLASSE: Record<string, number> = { A: 0, B: 1, C: 2 };

/** FUNÇÃO PURA — classificação ABC (Pareto do valor de consumo). */
export function classificarABC(items: any[], opts: any = {}): any[] {
  const { limiteA, limiteB } = { ...getLimitesABC(), ...opts };
  const ordenado = (items || [])
    .map((it) => ({ ...it, valorConsumo: num(it.valorConsumo) }))
    .sort((x, y) => y.valorConsumo - x.valorConsumo);
  const total = ordenado.reduce((s, it) => s + it.valorConsumo, 0);
  if (!(total > 0)) return ordenado.map((it) => ({ ...it, classeAbc: 'C', pctAcumulado: 1 }));
  let acumulado = 0;
  return ordenado.map((it) => {
    const prevPct = acumulado / total;
    acumulado += it.valorConsumo;
    let classe;
    if (it.valorConsumo <= 0) classe = 'C';
    else if (prevPct < limiteA) classe = 'A';
    else if (prevPct < limiteB) classe = 'B';
    else classe = 'C';
    return { ...it, classeAbc: classe, pctAcumulado: acumulado / total };
  });
}

// --- Filtro de família: só "Peças" + sem família (#N/D) ---
function normFam(s: unknown): string {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function getFamiliasIncluir(): Set<string> {
  const env = String(process.env.INV_FAMILIAS_INCLUIR || 'Peças').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(env.map(normFam));
}
function familiaIncluida(fam: unknown, incluir: Set<string>): boolean {
  const f = normFam(fam);
  if (f === '' || f === '#n/d' || f === 'n/d') return true;
  return incluir.has(f);
}

/** Varre as duas contas, agrega por SKU, classifica e faz upsert. Pesado: background. */
export async function recalcularCurvaInventario(opts: any = {}): Promise<any> {
  const onProgress = opts.onProgress || (() => {});
  const cfg = getConfig();
  const freqs = getFrequenciasABC();
  const lookbackMeses = Number.isInteger(opts.lookbackMeses) && opts.lookbackMeses > 0 ? opts.lookbackMeses : cfg.lookbackMeses;

  const dtAte = hoje();
  const dtDe = addMeses(dtAte, -lookbackMeses);
  const dataDeBR = fmtBR(dtDe);
  const dataAteBR = fmtBR(dtAte);

  const contas = getContasOmie().map((c) => c.id);
  if (!contas.length) throw new Error('Nenhuma conta Omie configurada');

  const bySku = new Map<string, any>();
  const ensure = (sku: string) => {
    if (!bySku.has(sku)) bySku.set(sku, { descricao: null, valorConsumo: 0, saldoTotal: 0, presenca: {} });
    return bySku.get(sku);
  };
  let semSku = 0;
  const incluirFam = getFamiliasIncluir();
  const skusVistos = new Set<string>();
  const skuPermitido = new Set<string>();
  let excluidosFamilia = 0;

  for (const conta of contas) {
    const label = labelConta(conta);
    onProgress(`[${label}] lendo familias dos produtos (filtro Pecas + #N/D)...`);
    let familiaMap = new Map<any, string>();
    try {
      familiaMap = await mapaFamiliaProduto(conta, { onProgress: (m: string) => onProgress(`[${label}] ${m}`) });
    } catch (e: any) {
      onProgress(`[${label}] leitura de familias falhou (${e.message}) - SEM filtro de familia nesta conta`);
    }

    onProgress(`[${label}] lendo NF de saida (${dataDeBR} a ${dataAteBR}) p/ consumo...`);
    const nfs = await listarNotasSaida(conta, dataDeBR, dataAteBR, { onProgress });
    const qtdeVendidaSku = new Map<string, number>();
    for (const nf of nfs) {
      if (!nf || nf.cancelada) continue;
      for (const it of nf.itens || []) {
        const sku = it.codigo != null ? String(it.codigo).trim() : null;
        if (!sku) continue;
        qtdeVendidaSku.set(sku, num(qtdeVendidaSku.get(sku)) + num(it.qtde));
      }
    }

    onProgress(`[${label}] lendo posicao de estoque (saldo + CMC) de todos os produtos...`);
    const posicao = await obterPosicaoEstoqueBulk(conta, { onProgress });
    for (const [idProd, info] of posicao) {
      const sku = info.codigo != null ? String(info.codigo).trim() : null;
      if (!sku) {
        semSku++;
        continue;
      }
      skusVistos.add(sku);
      if (familiaMap.size && !familiaIncluida(familiaMap.get(idProd), incluirFam)) {
        excluidosFamilia++;
        continue;
      }
      skuPermitido.add(sku);
      const e = ensure(sku);
      if (!e.descricao && info.descricao) e.descricao = info.descricao;
      const cmc = num(info.cmcMedioPonderado);
      const saldo = num(info.saldoTotal);
      e.valorConsumo += num(qtdeVendidaSku.get(sku)) * cmc;
      e.saldoTotal += saldo;
      const p = e.presenca[label] || { idProds: [], saldo: 0, cmc: 0, locais: [] };
      if (!p.idProds.includes(idProd)) p.idProds.push(idProd);
      p.saldo += saldo;
      if (cmc > 0) p.cmc = cmc;
      for (const pl of info.porLocal || []) p.locais.push({ localId: pl.localId, localNome: pl.localNome, saldo: num(pl.saldo), cmc: num(pl.cmc) });
      e.presenca[label] = p;
    }
    onProgress(`[${label}] ${posicao.size} produtos lidos`);
  }

  const itens = [...bySku.entries()].map(([sku, e]) => ({ key: sku, valorConsumo: e.valorConsumo }));
  const classificados = classificarABC(itens);
  const classePorSku = new Map(classificados.map((c) => [c.key, c.classeAbc]));
  const porClasse: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (const c of classificados) porClasse[c.classeAbc] = (porClasse[c.classeAbc] || 0) + 1;

  const existentes = new Map<string, any>();
  {
    const { data, error } = await supabase
      .from('produtos_inventario')
      .select('sku, frequencia_dias, frequencia_manual, ultima_contagem, proxima_contagem, ativo, incluido_manual')
      .limit(200000);
    if (error) throw new Error(`leitura de produtos_inventario falhou: ${error.message}`);
    for (const r of data || []) existentes.set(r.sku, r);
  }

  const hojeStr = hojeISO();
  const agora = new Date().toISOString();
  const linhas: any[] = [];
  for (const [sku, e] of bySku) {
    const classe = classePorSku.get(sku) || 'C';
    const prev = existentes.get(sku);
    const freqAuto = frequenciaDias(classe, freqs);
    const freq = prev && prev.frequencia_manual ? prev.frequencia_dias : freqAuto;
    let proxima;
    if (!prev) proxima = hojeStr;
    else if (prev.ultima_contagem) proxima = fmtISO(addDias(parseAnyDate(prev.ultima_contagem) as Date, freq));
    else proxima = prev.proxima_contagem || hojeStr;
    linhas.push({
      sku,
      descricao_produto: e.descricao || null,
      classe_abc: classe,
      valor_consumo: e.valorConsumo,
      frequencia_dias: freq,
      frequencia_manual: prev ? !!prev.frequencia_manual : false,
      proxima_contagem: proxima,
      saldo_total: e.saldoTotal,
      presenca: e.presenca,
      ativo: prev ? !!prev.ativo : true,
      incluido_manual: prev ? !!prev.incluido_manual : false,
      atualizado_em: agora,
    });
  }

  onProgress(`gravando ${linhas.length} SKUs em produtos_inventario...`);
  let atualizados = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    const { error } = await supabase.from('produtos_inventario').upsert(lote, { onConflict: 'sku' });
    if (error) throw new Error(`upsert produtos_inventario falhou: ${error.message}`);
    atualizados += lote.length;
  }

  let desativadosFamilia = 0;
  const skusBloqueados: string[] = [];
  for (const sku of skusVistos) {
    if (skuPermitido.has(sku)) continue;
    const prev = existentes.get(sku);
    if (prev && prev.ativo && !prev.incluido_manual) skusBloqueados.push(sku);
  }
  if (skusBloqueados.length) {
    onProgress(`desativando ${skusBloqueados.length} SKUs de familias excluidas (maquinas)...`);
    for (let i = 0; i < skusBloqueados.length; i += 200) {
      const lote = skusBloqueados.slice(i, i + 200);
      const { error } = await supabase.from('produtos_inventario').update({ ativo: false, atualizado_em: agora }).in('sku', lote);
      if (error) {
        onProgress(`desativar familia falhou: ${error.message}`);
        break;
      }
      desativadosFamilia += lote.length;
    }
  }

  return {
    janela: { de: dataDeBR, ate: dataAteBR, lookbackMeses },
    contas: contas.map((c) => labelConta(c)),
    totalSku: bySku.size,
    atualizados,
    semSku,
    porClasse,
    frequencias: freqs,
    familia: { incluir: Array.from(incluirFam), excluidosFamilia, desativadosFamilia },
  };
}

/** Cria um ciclo + tarefas das contagens vencidas. */
export async function gerarTarefasDia(opts: any = {}): Promise<any> {
  const tipo = opts.tipo === 'manual' ? 'manual' : 'diario';
  const capacidade = Number.isInteger(opts.capacidade) && opts.capacidade > 0 ? opts.capacidade : tipo === 'diario' ? getCapacidadeDiaria() : getCapacidadePadrao();
  const hojeStr = hojeISO();
  const referencia = opts.referencia || (tipo === 'diario' ? hojeStr : refMesAtual());
  const criadoPor = opts.criadoPor || (tipo === 'diario' ? 'agendador-diario' : 'app-inventario');

  if (tipo === 'diario') {
    const { data: jah } = await supabase.from('inventario_ciclos').select('id').eq('tipo', 'diario').eq('referencia', referencia).limit(1);
    if (jah && jah[0]) return { cicloId: jah[0].id, referencia, tipo, capacidade, criadas: 0, jaExistia: true, porClasse: { A: 0, B: 0, C: 0 } };
  }

  const { data: candidatos, error: e1 } = await supabase
    .from('produtos_inventario')
    .select('sku, descricao_produto, classe_abc, proxima_contagem')
    .eq('ativo', true)
    .in('classe_abc', ['A', 'B', 'C'])
    .lte('proxima_contagem', hojeStr)
    .limit(200000);
  if (e1) throw new Error(`selecao de candidatos falhou: ${e1.message}`);

  const { data: abertas, error: e2 } = await supabase.from('inventario_tarefas').select('sku').in('status', ['pendente', 'contando', 'recontagem']).limit(200000);
  if (e2) throw new Error(`leitura de tarefas em aberto falhou: ${e2.message}`);
  const emAberto = new Set((abertas || []).map((t) => t.sku));

  const elegiveis = (candidatos || [])
    .filter((c) => !emAberto.has(c.sku))
    .sort((a, b) => {
      const da = ORDEM_CLASSE[a.classe_abc] ?? 9;
      const db = ORDEM_CLASSE[b.classe_abc] ?? 9;
      if (da !== db) return da - db;
      return String(a.proxima_contagem).localeCompare(String(b.proxima_contagem));
    })
    .slice(0, capacidade);

  if (elegiveis.length === 0) {
    return { cicloId: null, referencia, tipo, capacidade, criadas: 0, porClasse: { A: 0, B: 0, C: 0 }, totalVencidos: (candidatos || []).length };
  }

  const { data: ciclo, error: e3 } = await supabase.from('inventario_ciclos').insert({ referencia, tipo, status: 'aberto', capacidade, criado_por: criadoPor }).select('id').single();
  if (e3) throw new Error(`criacao do ciclo falhou: ${e3.message}`);
  const cicloId = (ciclo as any).id;

  const porClasse: Record<string, number> = { A: 0, B: 0, C: 0 };
  const tarefas = elegiveis.map((c) => {
    porClasse[c.classe_abc] = (porClasse[c.classe_abc] || 0) + 1;
    return { ciclo_id: cicloId, sku: c.sku, descricao_produto: c.descricao_produto || null, classe_abc: c.classe_abc, status: 'pendente' };
  });
  const { error: e4 } = await supabase.from('inventario_tarefas').insert(tarefas);
  if (e4) throw new Error(`insercao das tarefas falhou: ${e4.message}`);

  return { cicloId, referencia, tipo, capacidade, criadas: tarefas.length, porClasse, totalVencidos: (candidatos || []).length };
}

/** Congela o saldo das tarefas 'pendente' de um ciclo lendo AO VIVO as duas contas. */
export async function freezeCiclo(cicloId: number, opts: any = {}): Promise<any> {
  const onProgress = opts.onProgress || (() => {});
  const { data: tarefas, error: et } = await supabase.from('inventario_tarefas').select('id, sku, status').eq('ciclo_id', cicloId).eq('status', 'pendente');
  if (et) throw new Error(`leitura de tarefas falhou: ${et.message}`);
  if (!tarefas || !tarefas.length) return { cicloId, congeladas: 0, falhas: 0 };

  const skus = [...new Set(tarefas.map((t) => t.sku))];
  const { data: prods, error: ep } = await supabase.from('produtos_inventario').select('sku, presenca, saldo_total').in('sku', skus);
  if (ep) throw new Error(`leitura de presenca falhou: ${ep.message}`);
  const presencaPorSku = new Map((prods || []).map((p) => [p.sku, p]));

  const labelToId: Record<string, any> = {};
  for (const c of getContasOmie()) labelToId[c.label] = c.id;

  let congeladas = 0;
  let falhas = 0;
  for (const t of tarefas) {
    try {
      const prod = presencaPorSku.get(t.sku);
      const presenca = prod && (prod as any).presenca ? (prod as any).presenca : null;
      if (!presenca || !Object.keys(presenca).length) throw new Error('SKU sem presenca (rode o recalculo da curva)');

      let saldoOmie = 0;
      let sumSaldoCmc = 0;
      let sumSaldoAbs = 0;
      let maxCmc = 0;
      const detalhe: any = {};
      for (const label of Object.keys(presenca)) {
        const contaId = labelToId[label];
        if (!contaId) continue;
        const idProds = presenca[label].idProds && presenca[label].idProds.length ? presenca[label].idProds : [];
        let saldoConta = 0;
        let cmcConta = 0;
        for (const idProd of idProds) {
          const pos = await obterPosicaoEstoqueProduto(contaId, idProd, { codigoLocalEstoque: 0 });
          saldoConta += num(pos.saldo);
          if (num(pos.cmc) > 0) cmcConta = num(pos.cmc);
        }
        saldoOmie += saldoConta;
        if (cmcConta > 0) {
          sumSaldoCmc += Math.abs(saldoConta) * cmcConta;
          sumSaldoAbs += Math.abs(saldoConta);
          maxCmc = Math.max(maxCmc, cmcConta);
        }
        detalhe[label] = { idProds, saldo: saldoConta, cmc: cmcConta };
      }
      const cmcFreeze = sumSaldoAbs > 0 ? sumSaldoCmc / sumSaldoAbs : maxCmc;

      const { error: eu } = await supabase
        .from('inventario_tarefas')
        .update({
          saldo_omie_freeze: saldoOmie,
          saldo_local_freeze: prod ? num((prod as any).saldo_total) : null,
          cmc_freeze: cmcFreeze,
          freeze_detalhe: detalhe,
          freeze_em: new Date().toISOString(),
          status: 'contando',
        })
        .eq('id', t.id);
      if (eu) throw new Error(eu.message);
      congeladas++;
      onProgress(`tarefa ${t.id} (${t.sku}) congelada`);
    } catch (e: any) {
      falhas++;
      console.warn(`[inventario freeze] tarefa ${t.id} (${t.sku}): ${e.faultstring || e.message}`);
    }
  }
  return { cicloId, congeladas, falhas };
}

/** Gera ciclo e dispara o freeze em background (Railway long-lived). */
export async function gerarCicloEFreeze(opts: any = {}): Promise<any> {
  const resultado = await gerarTarefasDia(opts);
  if (resultado.cicloId) {
    // freeze em background — a UI acompanha via /tarefas (status pendente -> contando)
    (async () => {
      try {
        await freezeCiclo(resultado.cicloId, { onProgress: (m: string) => console.log(`[inventario freeze ${resultado.cicloId}] ${m}`) });
      } catch (e: any) {
        console.warn('[inventario gerarCicloEFreeze] freeze:', e.message);
      }
    })();
  }
  return resultado;
}

/** Registra a contagem cega e concilia / dispara recontagem. */
export async function registrarContagem(tarefaId: number, qtdContada: any, opts: any = {}): Promise<any> {
  const qtd = Number(qtdContada);
  if (!Number.isFinite(qtd) || qtd < 0) throw httpErr(400, 'quantidade contada invalida');

  const { data: tarefa, error: e1 } = await supabase.from('inventario_tarefas').select('id, sku, status, saldo_omie_freeze, cmc_freeze').eq('id', tarefaId).single();
  if (e1 || !tarefa) throw httpErr(404, 'tarefa nao encontrada');
  if (!['contando', 'recontagem'].includes((tarefa as any).status)) {
    throw httpErr(409, `tarefa com status "${(tarefa as any).status}" nao aceita contagem (precisa estar congelada)`);
  }

  const { count } = await supabase.from('inventario_contagens').select('id', { count: 'exact', head: true }).eq('tarefa_id', tarefaId);
  const num1 = (count || 0) + 1;

  const { error: ec } = await supabase.from('inventario_contagens').insert({ tarefa_id: tarefaId, num: num1, qtd_contada: qtd, contado_por: opts.contadoPor || 'app-contagem' });
  if (ec) throw new Error(`gravacao da contagem falhou: ${ec.message}`);

  const divergencia = qtd - num((tarefa as any).saldo_omie_freeze);
  const tol = getTolerancia();
  const excede = excedeTolerancia(divergencia, (tarefa as any).saldo_omie_freeze, (tarefa as any).cmc_freeze, tol);

  if (num1 === 1 && excede) {
    await supabase.from('inventario_tarefas').update({ status: 'recontagem' }).eq('id', tarefaId);
    return { ok: true, status: 'recontagem', precisaRecontar: true };
  }

  if (divergencia !== 0) {
    await supabase
      .from('inventario_ajustes')
      .upsert({ tarefa_id: tarefaId, sku: (tarefa as any).sku, divergencia, valor_divergencia: divergencia * num((tarefa as any).cmc_freeze), status: 'pendente' }, { onConflict: 'tarefa_id' });
  }
  await supabase.from('inventario_tarefas').update({ status: 'conciliada' }).eq('id', tarefaId);

  try {
    const { data: prod } = await supabase.from('produtos_inventario').select('frequencia_dias').eq('sku', (tarefa as any).sku).single();
    const freq = prod && (prod as any).frequencia_dias ? (prod as any).frequencia_dias : getFrequenciasABC().C;
    await supabase.from('produtos_inventario').update({ ultima_contagem: hojeISO(), proxima_contagem: fmtISO(addDias(hoje(), freq)) }).eq('sku', (tarefa as any).sku);
  } catch (e: any) {
    console.warn('[inventario] avancar agenda:', e.message);
  }

  return { ok: true, status: 'conciliada', precisaRecontar: false };
}

export async function setCuradoria(sku: string, ativo: boolean): Promise<any> {
  const { error } = await supabase.from('produtos_inventario').update({ ativo: !!ativo, atualizado_em: new Date().toISOString() }).eq('sku', String(sku));
  if (error) throw new Error(error.message);
  return { sku, ativo: !!ativo };
}

export async function setFrequencia(sku: string, dias: any): Promise<any> {
  const d = parseInt(dias, 10);
  if (!Number.isInteger(d) || d <= 0) throw httpErr(400, 'frequencia (dias) deve ser inteiro > 0');
  const { data: prod } = await supabase.from('produtos_inventario').select('ultima_contagem').eq('sku', String(sku)).single();
  const base = prod && (prod as any).ultima_contagem ? (parseAnyDate((prod as any).ultima_contagem) as Date) : hoje();
  const { error } = await supabase
    .from('produtos_inventario')
    .update({ frequencia_dias: d, frequencia_manual: true, proxima_contagem: fmtISO(addDias(base, d)), atualizado_em: new Date().toISOString() })
    .eq('sku', String(sku));
  if (error) throw new Error(error.message);
  return { sku, frequencia_dias: d, frequencia_manual: true };
}

// ---- Worker-ready recálculo + queries para a UI ----

export async function iniciarRecalculo(criadoPor?: string): Promise<any> {
  if (getContasOmie().length === 0) throw httpErr(400, 'Nenhuma conta Omie configurada');
  if (await jobRodando('inventario-recalcular', null)) {
    const ativo = await lerJobAtivo('inventario-recalcular', null);
    return { ok: true, rodando: true, jaRodando: true, jobId: ativo?.id, etapa: ativo?.etapa };
  }
  const jobId = await criarJob('inventario-recalcular', null, criadoPor);
  (async () => {
    try {
      const resultado = await recalcularCurvaInventario({ onProgress: (m: string) => { atualizarJob(jobId, { etapa: m }); console.log(`[inventario-recalc] ${m}`); } });
      await concluirJob(jobId, resultado);
    } catch (e: any) {
      await falharJob(jobId, e.faultstring || e.message);
      console.error('[inventario-recalc]', e);
    }
  })();
  return { ok: true, rodando: true, jobId };
}

export async function lerStatusRecalculo(): Promise<any> {
  const ativo = await lerJobAtivo('inventario-recalcular', null);
  if (!ativo) return { rodando: false, etapa: '', resultado: null };
  return {
    rodando: ativo.status === 'rodando',
    etapa: ativo.etapa,
    inicio: ativo.iniciado_em,
    fim: ativo.status !== 'rodando' ? ativo.atualizado_em : null,
    erro: ativo.erro,
    resultado: ativo.resultado || null,
  };
}

export async function listarProdutosInventario(q: { classe?: string; ativo?: string; busca?: string; limit?: number }): Promise<any> {
  let query: any = supabase
    .from('produtos_inventario')
    .select('sku, descricao_produto, classe_abc, valor_consumo, frequencia_dias, frequencia_manual, proxima_contagem, ultima_contagem, saldo_total, ativo, incluido_manual')
    .order('valor_consumo', { ascending: false })
    .limit(Math.min(q.limit || 2000, 10000));
  if (q.classe && ['A', 'B', 'C'].includes(String(q.classe).toUpperCase())) query = query.eq('classe_abc', String(q.classe).toUpperCase());
  if (q.ativo === '1' || q.ativo === 'true') query = query.eq('ativo', true);
  if (q.ativo === '0' || q.ativo === 'false') query = query.eq('ativo', false);
  if (q.busca) query = query.or(`sku.ilike.%${String(q.busca)}%,descricao_produto.ilike.%${String(q.busca)}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const resumo: Record<string, number> = { A: 0, B: 0, C: 0, total: (data || []).length };
  for (const p of data || []) if (resumo[p.classe_abc] != null) resumo[p.classe_abc]++;
  return { produtos: data || [], resumo };
}

export async function listarCiclos(): Promise<any> {
  const { data, error } = await supabase
    .from('inventario_ciclos')
    .select('id, referencia, tipo, status, capacidade, criado_em, criado_por, fechado_em')
    .order('criado_em', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return { ciclos: data || [] };
}

export async function listarTarefas(q: { ciclo?: any; status?: string }): Promise<any> {
  let query: any = supabase
    .from('inventario_tarefas')
    .select('id, ciclo_id, sku, descricao_produto, classe_abc, status, freeze_em, criado_em')
    .order('classe_abc', { ascending: true })
    .order('id', { ascending: true })
    .limit(5000);
  if (q.ciclo) query = query.eq('ciclo_id', parseInt(q.ciclo, 10));
  if (q.status) query = query.eq('status', String(q.status));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { tarefas: data || [] };
}

/** Tarefas do dia para o contador (contagem cega: sem saldos). */
export async function tarefasDeHoje(): Promise<any> {
  let ciclo: any = null;
  const hojeStr = hojeISO();
  const { data: diario } = await supabase.from('inventario_ciclos').select('id, referencia, tipo, status, capacidade, criado_em').eq('tipo', 'diario').eq('referencia', hojeStr).limit(1);
  if (diario && diario[0]) ciclo = diario[0];
  if (!ciclo) {
    const { data: abertos } = await supabase.from('inventario_ciclos').select('id, referencia, tipo, status, capacidade, criado_em').eq('status', 'aberto').order('criado_em', { ascending: false }).limit(1);
    if (abertos && abertos[0]) ciclo = abertos[0];
  }
  if (!ciclo) return { ciclo: null, tarefas: [] };
  const { data: tarefas, error } = await supabase
    .from('inventario_tarefas')
    .select('id, sku, descricao_produto, classe_abc, status')
    .eq('ciclo_id', ciclo.id)
    .in('status', ['pendente', 'contando', 'recontagem', 'conciliada'])
    .order('classe_abc', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return { ciclo, tarefas: tarefas || [] };
}
