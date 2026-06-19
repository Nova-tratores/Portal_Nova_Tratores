/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Motor de deteccao: dado uma conta + janela, busca as NFs de entrada,
// identifica os itens "de garantia" (CFOP na lista configurada, custo zero ou
// custo muito abaixo do normal do produto), agrupa por produto e calcula um CMC
// sugerido. So LE da API Omie - nao persiste nada.
//
// IMPORTANTE p/ performance: NAO fazemos o bulk de ListarPosEstoque (e' lento -
// dezenas de minutos em catalogos grandes). Em vez disso, classificamos garantia
// so com os dados das NFs (CFOP / custo zero / custo << mediana do proprio
// produto) e, SO para os produtos afetados, consultamos PosicaoEstoque/Movimento
// Estoque por produto (poucas chamadas).
// =============================================================================

import { getConfig, cfopNormalizado, isCfopGarantia } from './config';
import type { AjustesConfig } from './config';
import {
  listarLocaisEstoque,
  obterPosicaoEstoqueBulk,
  obterPosicaoEstoqueProduto,
  obterMovimentosProduto,
  listarNotasEntrada,
  listarRecebimentos,
  consultarProduto,
  labelConta,
  getContasOmie,
  sleep,
  SLEEP_BETWEEN_PAGES,
} from './omie';
import { hoje, addMeses, addDias, fmtBR, parseAnyDate } from './dates';
import type { Conta } from './conta';

const RE_NATUREZA_GARANTIA = /garantia|conserto|reparo|assist[eê]ncia t[eé]cnica/i;

function num(v: any): number { return Number(v == null ? 0 : v) || 0; }
function ts(d: any): number { const x = parseAnyDate(d); return x ? x.getTime() : 0; }

export function mediana(arr: any[]): number {
  const xs = arr.filter(x => Number.isFinite(x) && x > 0).slice().sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function prodKey(codigoProduto: any, codigoIntegracao: any): string | null {
  if (codigoProduto != null && codigoProduto !== '') return String(codigoProduto);
  if (codigoIntegracao != null && codigoIntegracao !== '') return 'int:' + String(codigoIntegracao);
  return null;
}

// Classifica um item de NF. referenciaCusto = custo "normal" do produto (a
// mediana / o maximo das entradas do proprio produto, ou o CMC atual quando
// disponivel). Retorna { garantia, motivo } com motivo ∈
// 'recebimento'|'cfop'|'custo_zero'|'custo_baixo'|null.
export function classificarItem(item: any, cfg: AjustesConfig, referenciaCusto: number): { garantia: boolean; motivo: string | null } {
  if (item._forcaGarantia) return { garantia: true, motivo: 'recebimento' };
  if (isCfopGarantia(item.cfop, cfg)) return { garantia: true, motivo: 'cfop' };
  if (!(item.valUnit > 0)) return { garantia: true, motivo: 'custo_zero' };
  if (referenciaCusto > 0 && item.valUnit < cfg.thresholdCustoBaixo * referenciaCusto) {
    return { garantia: true, motivo: 'custo_baixo' };
  }
  return { garantia: false, motivo: null };
}

// Custo de referencia do produto a partir dos valores das suas entradas na
// janela: mediana, mas com piso de metade do maximo (robusto a poucos itens) e
// teto de 5x a mediana (robusto a um item-outlier de valor absurdo).
export function referenciaCustoDeEntradas(valUnits: any[], cmcAtual: number | null): number {
  const positivos = valUnits.filter(v => v > 0);
  const med = mediana(positivos);
  const mx = positivos.length ? Math.max(...positivos) : 0;
  let ref = 0;
  if (med > 0) ref = Math.max(med, 0.5 * mx);
  else ref = mx;
  if (med > 0 && ref > 5 * med) ref = 5 * med; // teto anti-outlier
  if (cmcAtual != null && cmcAtual > 0) ref = Math.max(ref, cmcAtual);
  return ref;
}

export function movimentoCasaGarantia(mov: any, nfsGarantia: any[]): boolean {
  // Match mais confiavel: pelo id do recebimento que originou o movimento.
  if (mov.idRecebimento != null) {
    for (const g of nfsGarantia) {
      if (g.idRecebimento != null && String(g.idRecebimento) === String(mov.idRecebimento)) return true;
    }
  }
  // Match por numero do documento (NF do fornecedor) - movimentos "Nota de Entrada de Produto".
  if (mov.numDoc) {
    const nd = String(mov.numDoc).replace(/\D/g, '').replace(/^0+/, '');
    for (const g of nfsGarantia) {
      const gn = String(g.numero || '').replace(/\D/g, '').replace(/^0+/, '');
      if (nd && gn && nd === gn && mov.qtdeEntrada > 0) return true;
    }
  }
  // Fallback: por valor unitario aproximado + proximidade de data (entradas em geral).
  if (!(mov.qtdeEntrada > 0)) return false;
  const cEnt = num(mov.entradaCMC);
  const dMov = ts(mov.data);
  for (const g of nfsGarantia) {
    const v = num(g.valUnit);
    const bateValor = (v <= 0) ? (cEnt < 0.01) : (Math.abs(cEnt - v) <= Math.max(0.02, v * 0.05));
    if (!bateValor) continue;
    const dG = ts(g.dataRef);
    if (dMov && dG && Math.abs(dMov - dG) > 45 * 86400 * 1000) continue;
    return true;
  }
  return false;
}

// Estrategia (A): primeiro movimento que casa com uma entrada de garantia ->
// devolve o CMC vigente imediatamente antes dele. { cmc, mov } ou null.
function cmcAnteriorViaMovimentos(movimentos: any[], nfsGarantia: any[]): { cmc: number; mov: any } | null {
  if (!Array.isArray(movimentos) || movimentos.length === 0) return null;
  for (let i = 0; i < movimentos.length; i++) {
    const m = movimentos[i];
    if (m.cancelado) continue;
    if (!movimentoCasaGarantia(m, nfsGarantia)) continue;
    if (m.cmcAnterior != null && m.cmcAnterior > 0) return { cmc: m.cmcAnterior, mov: m };
    for (let j = i - 1; j >= 0; j--) {
      if (movimentos[j].cancelado) continue;
      if (movimentos[j].cmcAtual != null && movimentos[j].cmcAtual > 0) return { cmc: movimentos[j].cmcAtual, mov: m };
    }
    return null;
  }
  return null;
}

export function calcularSugestao(produtoInfo: any, movimentos: any[]): any {
  const viaMov = cmcAnteriorViaMovimentos(movimentos, produtoInfo.nfsGarantia);
  if (viaMov && viaMov.cmc > 0) return { cmcSugerido: viaMov.cmc, estrategiaSugestao: 'cmc_movimento_anterior', movRef: viaMov.mov };

  const normais = produtoInfo.entradasNormais.slice().sort((a: any, b: any) => ts(b.dataRef) - ts(a.dataRef));
  const ultimoNormal = normais.find((e: any) => num(e.valUnit) > 0);
  if (ultimoNormal) return { cmcSugerido: num(ultimoNormal.valUnit), estrategiaSugestao: 'ultimo_custo_normal' };

  const med = mediana(produtoInfo.entradasNormais.map((e: any) => num(e.valUnit)));
  if (med > 0) return { cmcSugerido: med, estrategiaSugestao: 'mediana_custos_normais' };

  return { cmcSugerido: num(produtoInfo.cmcAtual), estrategiaSugestao: 'manual' };
}

// (re)classifica os itens de um produto contra uma referencia de custo e
// devolve { nfsGarantia, entradasNormais, cfopsGarantia }.
function segregarItens(itens: any[], cfg: AjustesConfig, referenciaCusto: number, conta: Conta, nfsComGarantiaSet: Set<string> | null): any {
  const nfsGarantia: any[] = [];
  const entradasNormais: any[] = [];
  const cfopsSet = new Set<string>();
  for (const it of itens) {
    const cls = classificarItem(it, cfg, referenciaCusto);
    if (cls.garantia) {
      nfsGarantia.push({
        numero: it.nfNumero, serie: it.nfSerie, codNotaEnt: it.nfCodNotaEnt,
        dataRef: it.nfDataRef, fornecedor: it.nfFornecedor,
        cfop: it.cfop, cfopNorm: cfopNormalizado(it.cfop), cfopForn: it._cfopForn || null,
        qtde: num(it.qtde), valUnit: num(it.valUnit), valTotal: num(it.valTotal),
        motivoClassificacao: cls.motivo, obs: it.nfObs,
        fonte: it._fonte || 'notaentrada', idRecebimento: it._idRecebimento || null
      });
      if (it.cfop) cfopsSet.add(String(it.cfop));
      if (nfsComGarantiaSet && (it.nfNumero != null || it._idRecebimento != null)) nfsComGarantiaSet.add(`${conta}|${it._idRecebimento || it.nfCodNotaEnt || it.nfNumero}`);
    } else {
      entradasNormais.push({ numero: it.nfNumero, dataRef: it.nfDataRef, qtde: num(it.qtde), valUnit: num(it.valUnit) });
    }
  }
  return { nfsGarantia, entradasNormais, cfopsGarantia: [...cfopsSet] };
}

export async function analisarConta(conta: Conta, opts: any = {}): Promise<any> {
  const cfg = getConfig();
  const t0 = Date.now();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const ate = (opts.dataAteBR && parseAnyDate(opts.dataAteBR)) ? parseAnyDate(opts.dataAteBR)! : hoje();
  const de = (opts.dataDeBR && parseAnyDate(opts.dataDeBR)) ? parseAnyDate(opts.dataDeBR)! : addMeses(ate, -cfg.lookbackMeses);
  const dataDeBR = fmtBR(de);
  const dataAteBR = fmtBR(ate);

  const itensPorProduto = new Map<string, any>();
  function produtoEntry(codigoProduto: any, codigoIntegracao: any, descricao: any): any {
    const key = prodKey(codigoProduto, codigoIntegracao);
    if (!key) return null;
    let p = itensPorProduto.get(key);
    if (!p) { p = { key, codigoProduto, codigoIntegracao, descricao, itens: [] }; itensPorProduto.set(key, p); }
    if (p.codigoProduto == null && codigoProduto != null) p.codigoProduto = codigoProduto;
    if (!p.codigoIntegracao && codigoIntegracao) p.codigoIntegracao = codigoIntegracao;
    if (!p.descricao && descricao) p.descricao = descricao;
    return p;
  }

  // FONTE A: notas de entrada (ListarNotaEnt) - notas de entrada "documento" (em
  // geral as criadas manualmente / TROC, conserto etc.).
  onProgress('buscando notas de entrada...');
  const nfs = await listarNotasEntrada(conta, dataDeBR, dataAteBR, { onProgress });
  const nfsValidas = nfs.filter(nf => !nf.cancelada);
  for (const nf of nfsValidas) {
    for (const it of nf.itens) {
      const p = produtoEntry(it.codigoProduto, it.codigoIntegracao, it.descricao);
      if (!p) continue;
      p.itens.push({
        ...it,
        nfNumero: nf.numero, nfSerie: nf.serie, nfCodNotaEnt: nf.codNotaEnt,
        nfDataRef: nf.dataRef,
        nfFornecedor: nf.nomeFornecedor || (nf.idFornecedor != null ? `#${nf.idFornecedor}` : null),
        nfObs: nf.obs || null,
        _fonte: 'notaentrada'
      });
    }
  }

  // FONTE B: recebimentos de NF-e JA PROCESSADOS com sinal de garantia.
  // (Essas entradas NAO aparecem em ListarNotaEnt - ficam no modulo de recebimento;
  // no estoque viram movimentos "Nota de Entrada de Produto" com idRecebimento.)
  // Sinal = natureza ~ garantia/conserto/reparo OU CFOP DO FORNECEDOR (cCFOP) na
  // lista de garantia. NAO usamos o cCFOPEntrada porque ele costuma ser "outra
  // entrada" (1949/2949) que e' generico demais. Janela limitada a 6 meses (a
  // distorcao costuma ser corrigida logo apos a entrada; ajustavel via LOOKBACK).
  const mesesRecebimentos = Math.max(1, Math.min(cfg.lookbackMeses, 3));
  const recDeBR = fmtBR(addMeses(ate, -mesesRecebimentos));
  onProgress(`buscando recebimentos de NF-e processados (${recDeBR} a ${dataAteBR})...`);
  let recs: any[] = [];
  try { recs = await listarRecebimentos(conta, recDeBR, dataAteBR, { onProgress }); }
  catch (e: any) { onProgress(`aviso: ListarRecebimentos falhou (${e.message})`); }
  const sinalGarantiaRec = (rec: any) => RE_NATUREZA_GARANTIA.test(rec.naturezaOperacao || '')
    || (rec.itens || []).some((it: any) => isCfopGarantia(it.cfop, cfg));
  let recsComSinal = 0;
  for (const rec of recs) {
    if (!rec.recebido || rec.cancelada) continue;
    if (!sinalGarantiaRec(rec)) continue;
    recsComSinal++;
    for (const it of rec.itens) {
      if (!(it.idProduto > 0)) continue; // produto novo: criado com esse custo, sem distorcao previa
      const p = produtoEntry(it.idProduto, it.codigoProdutoInt, it.descricaoProduto);
      if (!p) continue;
      p.itens.push({
        codigoProduto: it.idProduto, codigoIntegracao: it.codigoProdutoInt, descricao: it.descricaoProduto,
        cfop: it.cfopEntrada || it.cfop, qtde: num(it.qtde), valUnit: num(it.precoUnit), valTotal: num(it.valTotalItem), desconto: 0,
        nfNumero: rec.numeroNFe, nfSerie: rec.serieNFe, nfCodNotaEnt: null,
        nfDataRef: rec.dataEmissao,
        nfFornecedor: rec.fornecedorNome || (rec.idFornecedor != null ? `#${rec.idFornecedor}` : null),
        nfObs: rec.naturezaOperacao || null,
        _fonte: 'recebimento', _idRecebimento: rec.idReceb, _forcaGarantia: true, _cfopForn: it.cfop
      });
    }
  }
  onProgress(`fontes: ${nfsValidas.length} notas de entrada + ${recsComSinal} recebimentos processados com sinal de garantia; ${itensPorProduto.size} produtos no total`);

  // classificacao inicial (so dados de NF/recebimento) -> candidatos
  const nfsComGarantia = new Set<string>();
  const candidatos: any[] = [];
  for (const p of itensPorProduto.values()) {
    const ref0 = referenciaCustoDeEntradas(p.itens.map((i: any) => num(i.valUnit)), null);
    const seg0 = segregarItens(p.itens, cfg, ref0, conta, null);
    if (seg0.nfsGarantia.length === 0) continue;
    const garPos = seg0.nfsGarantia.map((g: any) => num(g.valUnit)).filter((v: any) => v > 0);
    const minGarantiaVU = garPos.length ? Math.min(...garPos) : 0;
    // "sinal forte" = ao menos uma garantia detectada por CFOP / custo zero / custo baixo
    // (nao apenas por vir de um recebimento generico). Esses sempre vao p/ enriquecimento.
    const sinalForte = seg0.nfsGarantia.some((g: any) => g.motivoClassificacao && g.motivoClassificacao !== 'recebimento');
    candidatos.push({ p, minGarantiaVU, sinalForte });
  }
  onProgress(`${candidatos.length} produtos candidatos`);

  // 4. enriquece os candidatos. Para os "fracos" (so de recebimento), faz antes
  // um pre-filtro barato: 1 consulta de PosicaoEstoque consolidada; so prossegue
  // se o produto tem saldo, tem CMC e o custo de garantia esta bem abaixo do CMC.
  let locais: any[] = [];
  if (candidatos.length > 0) {
    try { locais = await listarLocaisEstoque(conta); } catch (e: any) { onProgress(`aviso: ListarLocaisEstoque falhou (${e.message})`); }
    await sleep(SLEEP_BETWEEN_PAGES);
  }
  const dataMovDeBR = fmtBR(addMeses(de, -6));

  const produtosAfetados: any[] = [];
  let preFiltrados = 0;
  for (let k = 0; k < candidatos.length; k++) {
    const { p, minGarantiaVU, sinalForte } = candidatos[k];

    // 4-pre. pre-filtro barato (so para candidatos fracos)
    let posCons: any = null;
    if (p.codigoProduto != null) {
      try {
        const pc = await obterPosicaoEstoqueProduto(conta, p.codigoProduto, { codigoLocalEstoque: 0 });
        posCons = { saldo: num(pc.saldo), cmc: num(pc.cmc) };
      } catch (e) { /* segue sem - sera tratado abaixo */ }
      await sleep(900);
    }
    if (!sinalForte) {
      const distorceEsperado = !!(posCons && posCons.cmc > 0 && posCons.saldo > 0 && minGarantiaVU > 0 && minGarantiaVU < 0.7 * posCons.cmc);
      if (!distorceEsperado) { preFiltrados++; continue; }
    }
    onProgress(`enriquecendo produto ${produtosAfetados.length + 1} (cod ${p.codigoProduto}) [cand ${k + 1}/${candidatos.length}]`);

    // 4a0. descricao do produto (ListarNotaEnt/recebimento nao traz a descricao confiavel)
    if (!p.descricao && p.codigoProduto != null) {
      try {
        const pr = await consultarProduto(conta, p.codigoProduto);
        if (pr && pr.descricao) p.descricao = pr.descricao;
        if (pr && pr.codigoIntegracao && !p.codigoIntegracao) p.codigoIntegracao = pr.codigoIntegracao;
      } catch (e) { /* ignora */ }
      await sleep(700);
    }

    // 4a. posicao de estoque por local
    const porLocal: any[] = [];
    if (p.codigoProduto != null && locais.length > 0) {
      for (const loc of locais) {
        try {
          const pos = await obterPosicaoEstoqueProduto(conta, p.codigoProduto, { codigoLocalEstoque: loc.id });
          porLocal.push({ localId: loc.id, localNome: loc.nome, saldo: num(pos.saldo), cmc: num(pos.cmc) });
        } catch (e: any) { onProgress(`  aviso: PosicaoEstoque prod ${p.codigoProduto} local ${loc.id}: ${e.message}`); }
        await sleep(900);
      }
    } else if (posCons) {
      porLocal.push({ localId: 0, localNome: '(consolidado)', saldo: posCons.saldo, cmc: posCons.cmc });
    }
    let somaSaldo = 0, somaPond = 0, somaPeso = 0;
    for (const pl of porLocal) { somaSaldo += pl.saldo; if (pl.cmc > 0) { const w = pl.saldo > 0 ? pl.saldo : 1; somaPond += pl.cmc * w; somaPeso += w; } }
    let cmcAtual: number | null = somaPeso > 0 ? somaPond / somaPeso : null;
    if (cmcAtual == null && posCons && posCons.cmc > 0) cmcAtual = posCons.cmc;
    const saldoTotal = porLocal.length ? somaSaldo : (posCons ? posCons.saldo : null);

    // 4b. re-classifica com a referencia incluindo o CMC atual
    const ref = referenciaCustoDeEntradas(p.itens.map((i: any) => num(i.valUnit)), cmcAtual);
    const seg = segregarItens(p.itens, cfg, ref, conta, nfsComGarantia);
    if (seg.nfsGarantia.length === 0) continue;

    // 4c. movimentos -> sugestao de CMC
    let movimentos: any[] = [];
    if (p.codigoProduto != null) {
      try { movimentos = await obterMovimentosProduto(conta, p.codigoProduto, dataMovDeBR, dataAteBR); }
      catch (e: any) { onProgress(`  aviso: MovimentoEstoque prod ${p.codigoProduto}: ${e.message}`); }
      await sleep(900);
    }
    const prodInfo = { nfsGarantia: seg.nfsGarantia, entradasNormais: seg.entradasNormais, cmcAtual };
    let sug = calcularSugestao(prodInfo, movimentos);

    const datasGarantia = seg.nfsGarantia.map((g: any) => ts(g.dataRef)).filter(Boolean);
    const tsPrimeiraGarantia = datasGarantia.length ? Math.min(...datasGarantia) : 0;

    // Se nao achamos um CMC "de antes" e o produto so tem garantia (vindo de
    // recebimento, sem entradas normais), tenta o CMC apos a ultima COMPRA real
    // anterior a primeira garantia; se nem isso existir, e' um produto novo
    // (criado com o custo da garantia) - sem distorcao previa -> pula.
    const soGarantia = seg.entradasNormais.length === 0;
    if (sug.estrategiaSugestao !== 'cmc_movimento_anterior' && soGarantia) {
      let ultimaCompra: any = null;
      for (const m of movimentos) {
        if (m.cancelado) continue;
        if (!(m.qtdeEntrada > 0) || !(m.cmcAtual > 0)) continue;
        if (!/compra/i.test(m.desOrigem || '') && !/^COM/.test(m.codOrigem || '')) continue;
        if (tsPrimeiraGarantia && ts(m.data) && ts(m.data) > tsPrimeiraGarantia + 86400000) continue; // ate ~1 dia depois
        ultimaCompra = m;
      }
      if (ultimaCompra) {
        sug = { cmcSugerido: ultimaCompra.cmcAtual, estrategiaSugestao: 'ultimo_cmc_compra', movRef: ultimaCompra };
      } else {
        // sem prova de CMC anterior -> produto novo / sem distorcao previa
        onProgress(`  produto ${p.codigoProduto} sem CMC anterior detectavel - ignorado (provavelmente produto novo)`);
        continue;
      }
    }

    // Se a garantia veio so de recebimento generico (sem sinal CFOP/custo) e, com
    // o CMC ja enriquecido, o produto nao esta de fato distorcido (CMC atual ja
    // esta no nivel - ou acima - do sugerido), ignora.
    const todoRecebimentoGenerico = seg.nfsGarantia.every((g: any) => g.motivoClassificacao === 'recebimento');
    if (todoRecebimentoGenerico && cmcAtual != null && sug.cmcSugerido > 0 && cmcAtual >= sug.cmcSugerido * 0.99) {
      onProgress(`  produto ${p.codigoProduto} sem distorcao relevante (CMC atual ${cmcAtual.toFixed(2)} ~ sugerido ${sug.cmcSugerido.toFixed(2)}) - ignorado`);
      continue;
    }

    const dataPrimeiraGarantia = tsPrimeiraGarantia ? fmtBR(new Date(tsPrimeiraGarantia)) : null;
    const custosGarantia = seg.nfsGarantia.map((g: any) => g.valUnit).filter((c: any) => c >= 0);
    const ultimoGarantia = seg.nfsGarantia.slice().sort((a: any, b: any) => ts(b.dataRef) - ts(a.dataRef))[0];
    const minNormal = seg.entradasNormais.length ? Math.min(...seg.entradasNormais.map((e: any) => num(e.valUnit)).filter((v: any) => v > 0)) : null;

    produtosAfetados.push({
      key: p.key,
      codigoProduto: p.codigoProduto ?? null,
      codigoIntegracao: p.codigoIntegracao ?? null,
      descricao: p.descricao || null,
      cmcAtual,
      saldoTotal,
      porLocal,
      qtdNfsGarantia: seg.nfsGarantia.length,
      cfopsGarantia: seg.cfopsGarantia,
      dataPrimeiraGarantia,
      menorCustoGarantia: custosGarantia.length ? Math.min(...custosGarantia) : null,
      ultimoCustoGarantia: ultimoGarantia ? num(ultimoGarantia.valUnit) : null,
      nfsGarantia: seg.nfsGarantia,
      entradasNormais: seg.entradasNormais,
      cmcSugerido: sug.cmcSugerido,
      estrategiaSugestao: sug.estrategiaSugestao,
      cmcSugeridoBaseadoEm: sug.movRef ? { data: sug.movRef.data, doc: sug.movRef.numDoc, origem: sug.movRef.desOrigem || sug.movRef.codOrigem } : null,
      provavelmenteDistorcido: !!(cmcAtual != null && ((minNormal != null && cmcAtual < minNormal * 0.95) || (sug.cmcSugerido > 0 && cmcAtual < sug.cmcSugerido * 0.97))),
      movimentosResumo: movimentos.slice(-25).map((m: any) => ({
        data: m.data, codOrigem: m.codOrigem, desOrigem: m.desOrigem, numDoc: m.numDoc,
        qtdeEntrada: m.qtdeEntrada, entradaCMC: m.entradaCMC, qtdeSaida: m.qtdeSaida,
        cmcAnterior: m.cmcAnterior, cmcAtual: m.cmcAtual, cancelado: m.cancelado, devolucao: m.devolucao
      })),
      jaCorrigido: false,
      ultimaCorrecao: null
    });
  }

  produtosAfetados.sort((a, b) => {
    if (a.provavelmenteDistorcido !== b.provavelmenteDistorcido) return a.provavelmenteDistorcido ? -1 : 1;
    return b.qtdNfsGarantia - a.qtdNfsGarantia;
  });

  const totalItensGarantia = produtosAfetados.reduce((s, p) => s + p.qtdNfsGarantia, 0);

  return {
    conta,
    contaLabel: labelConta(conta),
    dataDeBR, dataAteBR,
    geradoEm: new Date().toISOString(),
    duracaoMs: Date.now() - t0,
    totalNfs: nfs.length,
    totalNfsValidas: nfsValidas.length,
    totalNfsCanceladas: nfs.length - nfsValidas.length,
    totalNfsComItemGarantia: nfsComGarantia.size,
    totalItensGarantia,
    totalProdutosAfetados: produtosAfetados.length,
    config: { cfopsGarantia: cfg.cfopsGarantia, thresholdCustoBaixo: cfg.thresholdCustoBaixo, lookbackMeses: cfg.lookbackMeses },
    produtos: produtosAfetados
  };
}

// =============================================================================
// Analise dos RECEBIMENTOS DE NF-e PENDENTES (todos - nao so os de garantia).
// Os com "sinal de garantia" (CFOP do fornecedor de garantia OU natureza ~
// garantia/conserto) sao ENRIQUECIDOS: para cada item que associa um produto ja
// cadastrado, estima o CMC projetado apos a entrada (alerta antes do estrago) e
// marca itens de produto NOVO. Os demais pendentes vao "crus" (so cabec).
// O front oferece "Dar entrada" (= ConcluirRecebimento) em qualquer um deles.
// =============================================================================
export async function analisarRecebimentosPendentes(conta: Conta, opts: any = {}): Promise<any> {
  const cfg = getConfig();
  const t0 = Date.now();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const ate = (opts.dataAteBR && parseAnyDate(opts.dataAteBR)) ? parseAnyDate(opts.dataAteBR)! : hoje();
  const mesesJanela = Number.isInteger(opts.lookbackMeses) ? opts.lookbackMeses : 6; // pendentes raramente sao antigos
  const de = (opts.dataDeBR && parseAnyDate(opts.dataDeBR)) ? parseAnyDate(opts.dataDeBR)! : addMeses(ate, -mesesJanela);
  const dataDeBR = fmtBR(de);
  const dataAteBR = fmtBR(ate);

  onProgress('buscando recebimentos de NF-e...');
  const recs = await listarRecebimentos(conta, dataDeBR, dataAteBR, { onProgress });
  const totalRecebimentos = recs.length;
  const naoProcessados = recs.filter(r => !r.recebido && !r.cancelada);

  function sinalGarantia(rec: any): string | null {
    if (RE_NATUREZA_GARANTIA.test(rec.naturezaOperacao || '')) return 'natureza';
    if ((rec.itens || []).some((it: any) => isCfopGarantia(it.cfop, cfg))) return 'cfop';
    return null;
  }
  const pendentes = naoProcessados.map(r => {
    const sinal = sinalGarantia(r);
    return { ...r, sinal, temSinalGarantia: !!sinal };
  });
  const comSinal = pendentes.filter(r => r.temSinalGarantia);

  // enriquece SO os com sinal de garantia: CMC + saldo atuais (consolidado) por produto
  const idsProd = [...new Set(comSinal.flatMap(r => (r.itens || []).filter((it: any) => it.idProduto > 0).map((it: any) => it.idProduto)))];
  const cmcPorProd = new Map<any, any>();
  for (let i = 0; i < idsProd.length; i++) {
    const id = idsProd[i];
    onProgress(`CMC do produto ${i + 1}/${idsProd.length} (cod ${id})`);
    try {
      const pos = await obterPosicaoEstoqueProduto(conta, id, { codigoLocalEstoque: 0 });
      cmcPorProd.set(id, { saldo: num(pos.saldo), cmc: num(pos.cmc) });
    } catch (e: any) { onProgress(`  aviso: PosicaoEstoque prod ${id}: ${e.message}`); }
    await sleep(1000);
  }

  let totalItensRisco = 0;
  for (const r of comSinal) {
    r.temItemNovo = false;
    r.temItemRisco = false;
    r.maiorImpactoPct = 0;
    for (const it of (r.itens || [])) {
      it.cfopEhGarantia = isCfopGarantia(it.cfop, cfg);
      if (it.criarNovo || (!it.idProduto && !it.associarExistente)) { it.tipoItem = 'novo'; r.temItemNovo = true; continue; }
      it.tipoItem = 'existente';
      const cur = it.idProduto ? cmcPorProd.get(it.idProduto) : null;
      it.cmcAtual = cur ? cur.cmc : null;
      it.saldoAtual = cur ? cur.saldo : null;
      const custoEnt = it.precoUnit > 0 ? it.precoUnit : (it.qtde > 0 ? it.valTotalItem / it.qtde : 0);
      it.custoEntradaEstimado = custoEnt;
      if (cur && (cur.saldo + it.qtde) > 0 && custoEnt >= 0) {
        it.cmcProjetado = (cur.saldo * cur.cmc + it.qtde * custoEnt) / (cur.saldo + it.qtde);
        it.impactoCMC = (it.cmcAtual != null) ? (it.cmcProjetado - it.cmcAtual) : null;
        it.impactoPct = (it.cmcAtual > 0) ? (it.cmcProjetado - it.cmcAtual) / it.cmcAtual : null;
        it.alerta = (it.cmcAtual > 0 && it.cmcProjetado < it.cmcAtual * 0.97); // queda > 3%
        if (it.alerta) { r.temItemRisco = true; totalItensRisco++; if (it.impactoPct != null) r.maiorImpactoPct = Math.min(r.maiorImpactoPct, it.impactoPct); }
      }
    }
  }

  // ordena: com sinal de garantia primeiro (e os de risco no topo), depois por data de emissao desc
  pendentes.sort((a, b) => {
    if (a.temSinalGarantia !== b.temSinalGarantia) return a.temSinalGarantia ? -1 : 1;
    if (!!a.temItemRisco !== !!b.temItemRisco) return a.temItemRisco ? -1 : 1;
    return ts(b.dataEmissao) - ts(a.dataEmissao);
  });

  return {
    conta,
    contaLabel: labelConta(conta),
    dataDeBR, dataAteBR,
    geradoEm: new Date().toISOString(),
    duracaoMs: Date.now() - t0,
    totalRecebimentos,
    totalNaoProcessados: naoProcessados.length,
    totalComSinalGarantia: comSinal.length,
    totalItensRisco,
    recebimentos: pendentes
  };
}

// =============================================================================
// Analise de ESTOQUE NEGATIVO (bug do Omie: estoque fisico negativo faz o CMC
// despencar progressivamente - media ponderada com denominador negativo da
// custos cada vez menores). Varre TODOS os produtos (ListarPosEstoque em massa -
// LENTO), seleciona os com saldo total < 0, e para cada um busca o historico de
// movimentos pra achar o CMC vigente ANTES de o produto ficar negativo (= o CMC
// "bom" a restaurar) via ajuste SLD. Funcao pesada -> rodar em background.
// =============================================================================
// chave para cruzar o mesmo produto entre as contas (NOVA <-> CASTRO):
// somente cCodigo (o "codigo" do produto). Decisao do usuario - ele garante
// que o mesmo SKU usa o mesmo cCodigo nas duas empresas.
function chaveCruzamentoProduto(est: any): string | null {
  const cod = est && est.codigo != null ? String(est.codigo).trim() : '';
  if (cod) return 'cod:' + cod.toUpperCase();
  return null;
}
function indicePosicaoPorChave(mapaPosicao: Map<any, any> | null): Map<string, any> {
  const idx = new Map<string, any>(); // chave -> { codigoProduto, est }
  if (!mapaPosicao) return idx;
  for (const [codigoProduto, est] of mapaPosicao) {
    const k = chaveCruzamentoProduto(est);
    if (k && !idx.has(k)) idx.set(k, { codigoProduto, est });
  }
  return idx;
}

export async function analisarEstoqueNegativo(conta: Conta, opts: any = {}): Promise<any> {
  const t0 = Date.now();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  let mapa = opts.posicaoJaVarrida;
  if (!(mapa instanceof Map)) {
    onProgress('varrendo posicao de estoque de todos os produtos (isso demora)...');
    mapa = await obterPosicaoEstoqueBulk(conta, { onProgress });
  }
  const totalProdutos = mapa.size;

  // indice da OUTRA conta (p/ detectar "faturado na empresa errada")
  const outraConta = opts.outraContaId || null;
  const outraContaLabel = opts.outraContaLabel || (outraConta ? labelConta(outraConta) : null);
  const idxOutra = (opts.posicaoOutraConta instanceof Map) ? indicePosicaoPorChave(opts.posicaoOutraConta) : null;

  // produtos com saldo total negativo (ou algum local negativo)
  const negativos: any[] = [];
  for (const [codigoProduto, est] of mapa) {
    const algumLocalNeg = (est.porLocal || []).some((l: any) => num(l.saldo) < 0);
    if (num(est.saldoTotal) < 0 || algumLocalNeg) negativos.push({ codigoProduto, est });
  }
  onProgress(`${negativos.length} produtos com estoque negativo (de ${totalProdutos} varridos)`);

  const ate = hoje();
  const dataMovDeBR = fmtBR(addMeses(ate, -24));
  const dataMovAteBR = fmtBR(ate);

  const produtos: any[] = [];
  for (let i = 0; i < negativos.length; i++) {
    const { codigoProduto, est } = negativos[i];
    onProgress(`historico do produto ${i + 1}/${negativos.length} (cod ${codigoProduto})`);

    // descricao (se o bulk nao trouxe)
    let descricao = est.descricao || null;
    let codigoIntegracao = est.codInt || null;
    if (!descricao) {
      try { const pr = await consultarProduto(conta, codigoProduto); if (pr) { descricao = pr.descricao || descricao; codigoIntegracao = codigoIntegracao || pr.codigoIntegracao; } } catch (e) { /* segue */ }
      await sleep(700);
    }

    let movimentos: any[] = [];
    try { movimentos = await obterMovimentosProduto(conta, codigoProduto, dataMovDeBR, dataMovAteBR); }
    catch (e: any) { onProgress(`  aviso: MovimentoEstoque prod ${codigoProduto}: ${e.message}`); }
    await sleep(900);

    // acha o 1o movimento em que a qtde acumulada ficou < 0
    let idxNeg = -1;
    for (let j = 0; j < movimentos.length; j++) {
      if (movimentos[j].cancelado) continue;
      if (movimentos[j].qtdeAtual != null && movimentos[j].qtdeAtual < 0) { idxNeg = j; break; }
    }
    let cmcSugerido: number | null = null, estrategiaSugestao = 'manual', dataFicouNegativo: any = null, movRef: any = null;
    if (idxNeg >= 0) {
      const mNeg = movimentos[idxNeg];
      dataFicouNegativo = mNeg.data || null;
      movRef = mNeg;
      // CMC "bom" = o vigente antes desse movimento (cmcAnterior) ou o cmcAtual do movimento anterior
      if (mNeg.cmcAnterior != null && mNeg.cmcAnterior > 0) { cmcSugerido = mNeg.cmcAnterior; estrategiaSugestao = 'cmc_antes_de_negativo'; }
      else {
        for (let j = idxNeg - 1; j >= 0; j--) {
          if (!movimentos[j].cancelado && movimentos[j].cmcAtual != null && movimentos[j].cmcAtual > 0) { cmcSugerido = movimentos[j].cmcAtual; estrategiaSugestao = 'cmc_antes_de_negativo'; movRef = movimentos[j]; break; }
        }
      }
    }
    if (cmcSugerido == null) {
      // fallback: maior cmcAtual entre movimentos de Compra de Produto, ou o ultimo
      let melhorCompra: any = null;
      for (const m of movimentos) {
        if (m.cancelado) continue;
        if (!(m.qtdeEntrada > 0) || !(m.cmcAtual > 0)) continue;
        if (!/compra/i.test(m.desOrigem || '') && !/^COM/.test(m.codOrigem || '')) continue;
        if (melhorCompra == null || m.cmcAtual > melhorCompra.cmcAtual) melhorCompra = m;
      }
      if (melhorCompra) { cmcSugerido = melhorCompra.cmcAtual; estrategiaSugestao = 'maior_cmc_compra'; movRef = melhorCompra; }
    }
    if (cmcSugerido == null) {
      cmcSugerido = num(est.cmcMedioPonderado);
      estrategiaSugestao = 'manual';
    }

    // data sugerida do ajuste retroativo = dia seguinte ao que ficou negativo
    let dataAjusteRetroativoBR: string | null = null;
    if (dataFicouNegativo) { const d = parseAnyDate(dataFicouNegativo); if (d) dataAjusteRetroativoBR = fmtBR(addDias(d, 1)); }

    // suspeita "faturado na empresa errada": o mesmo produto existe na outra conta com saldo > 0
    let suspeitaEmpresaErrada = false, outraEmpresa: any = null;
    if (idxOutra) {
      const k = chaveCruzamentoProduto({ codigo: est.codigo, codInt: est.codInt || codigoIntegracao, descricao: est.descricao || descricao });
      const m = k ? idxOutra.get(k) : null;
      if (m && num(m.est.saldoTotal) > 0) {
        suspeitaEmpresaErrada = true;
        outraEmpresa = { conta: outraConta, contaLabel: outraContaLabel, codigoProduto: m.codigoProduto, saldo: num(m.est.saldoTotal), cmc: num(m.est.cmcMedioPonderado), chave: k };
      }
    }

    produtos.push({
      key: String(codigoProduto),
      codigoProduto,
      codigoIntegracao: codigoIntegracao || est.codInt || null,
      codigo: est.codigo || null,
      descricao: descricao || null,
      cmcAtual: num(est.cmcMedioPonderado),
      saldoTotal: num(est.saldoTotal),
      porLocal: (est.porLocal || []).map((l: any) => ({ localId: l.localId, localNome: l.localNome, saldo: num(l.saldo), cmc: num(l.cmc) })),
      cmcSugerido,
      estrategiaSugestao,
      dataFicouNegativo,
      dataAjusteRetroativoBR,
      suspeitaEmpresaErrada,
      outraEmpresa,
      cmcSugeridoBaseadoEm: movRef ? { data: movRef.data, doc: movRef.numDoc, origem: movRef.desOrigem || movRef.codOrigem } : null,
      movimentosResumo: (movimentos || []).slice(-30).map((m: any) => ({
        data: m.data, codOrigem: m.codOrigem, desOrigem: m.desOrigem, numDoc: m.numDoc,
        qtdeEntrada: m.qtdeEntrada, entradaCMC: m.entradaCMC, qtdeSaida: m.qtdeSaida,
        qtdeAtual: m.qtdeAtual, cmcAnterior: m.cmcAnterior, cmcAtual: m.cmcAtual, cancelado: m.cancelado, devolucao: m.devolucao
      })),
      jaCorrigido: false,
      ultimaCorrecao: null
    });
  }

  // ordena: suspeitas primeiro, depois mais negativos
  produtos.sort((a, b) => {
    if (!!a.suspeitaEmpresaErrada !== !!b.suspeitaEmpresaErrada) return a.suspeitaEmpresaErrada ? -1 : 1;
    return num(a.saldoTotal) - num(b.saldoTotal);
  });

  return {
    conta,
    contaLabel: labelConta(conta),
    geradoEm: new Date().toISOString(),
    duracaoMs: Date.now() - t0,
    totalProdutos,
    totalNegativos: produtos.length,
    totalSuspeitas: produtos.filter(p => p.suspeitaEmpresaErrada).length,
    produtos
  };
}

// =============================================================================
// Verificacao DIARIA: varre as 2 contas, atualiza a tela "Estoque negativo" e
// gera alertas. Recebe callbacks pra nao depender de Supabase diretamente:
//   gravarAlerta(alerta)  -> grava em cmc_alertas (com dedup por `ref`)
//   lerSnapshot(conta)    -> Promise<{ data, snapshot }|null>  (snapshot = {codProd: [saldo, cmc]})
//   salvarSnapshot(conta, snapshot) -> Promise
//   guardarNegativos(conta, resultadoAnalise) -> atualiza o cache/state da aba Estoque negativo
// =============================================================================
export interface VerificacaoDiariaOpts {
  onProgress?: (msg: string) => void;
  gravarAlerta?: (alerta: any) => Promise<any> | any;
  lerSnapshot?: (conta: Conta) => Promise<{ data: any; snapshot: any } | null> | ({ data: any; snapshot: any } | null);
  salvarSnapshot?: (conta: Conta, snapshot: any) => Promise<any> | any;
  guardarNegativos?: (conta: Conta, resultadoAnalise: any) => Promise<any> | any;
  listarPedidos?: (conta: Conta) => Promise<any[]> | any[];
}

export async function verificacaoDiaria(opts: VerificacaoDiariaOpts = {}): Promise<any> {
  const t0 = Date.now();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const gravarAlerta = typeof opts.gravarAlerta === 'function' ? opts.gravarAlerta : async () => {};
  const lerSnapshot = typeof opts.lerSnapshot === 'function' ? opts.lerSnapshot : async () => null;
  const salvarSnapshot = typeof opts.salvarSnapshot === 'function' ? opts.salvarSnapshot : async () => {};
  const guardarNegativos = typeof opts.guardarNegativos === 'function' ? opts.guardarNegativos : async () => {};
  const cfg = getConfig();
  const pctQueda = (() => { const v = parseFloat(process.env.ALERTA_CMC_QUEDA_PCT || ''); return (isFinite(v) && v > 0 && v < 1) ? v : 0.15; })();
  const contas = getContasOmie();
  let alertasNovos = 0;
  const totaisPorTipo: any = { negativo: 0, cmc_queda: 0, recebimento_garantia: 0, suspeita_empresa_errada: 0, pedido_parado: 0 };
  const diasParadoMin = (() => { const v = parseInt(process.env.ALERTA_PEDIDO_PARADO_DIAS || '', 10); return (Number.isFinite(v) && v > 0) ? v : 15; })();
  const listarPedidos = typeof opts.listarPedidos === 'function' ? opts.listarPedidos : null;
  const resumoContas: any[] = [];

  // 1. varre a posicao de estoque de TODAS as contas (1x cada)
  const posicoes: Record<string, Map<any, any>> = {};
  for (const c of contas) {
    onProgress(`varrendo estoque da conta ${c.label}...`);
    try { posicoes[c.id] = await obterPosicaoEstoqueBulk(c.id, { onProgress: (m: string) => onProgress(`[${c.label}] ${m}`) }); }
    catch (e: any) { onProgress(`[${c.label}] aviso: varredura de estoque falhou (${e.message})`); posicoes[c.id] = new Map(); }
  }

  for (const c of contas) {
    const conta = c.id, contaLabel = c.label;
    const outra = contas.find(x => x.id !== conta);
    const mapaHoje = posicoes[conta] || new Map();

    // 2. analise de estoque negativo (reusa a posicao ja varrida + cruza com a outra conta)
    onProgress(`[${contaLabel}] analisando negativos...`);
    let resNeg: any = { produtos: [], totalProdutos: mapaHoje.size, totalNegativos: 0, totalSuspeitas: 0 };
    try {
      resNeg = await analisarEstoqueNegativo(conta, {
        posicaoJaVarrida: mapaHoje,
        posicaoOutraConta: outra ? posicoes[outra.id] : null,
        outraContaId: outra ? outra.id : null, outraContaLabel: outra ? outra.label : null,
        onProgress: (m: string) => onProgress(`[${contaLabel}] ${m}`)
      });
    } catch (e: any) { onProgress(`[${contaLabel}] aviso: analise de negativos falhou (${e.message})`); }
    try { await guardarNegativos(conta, resNeg); } catch (e) { /* ignora */ }

    // 3. alertas baseados no estado atual + diff vs ultimo snapshot
    let snapAnt: any = null;
    try { snapAnt = await lerSnapshot(conta); } catch (e) { /* ignora */ }
    const snapAntMap = (snapAnt && snapAnt.snapshot) || null;
    const snapHoje: any = {};
    for (const [codProd, est] of mapaHoje) snapHoje[codProd] = [num(est.saldoTotal), num(est.cmcMedioPonderado)];
    for (const [codProd, est] of mapaHoje) {
      const saldoHoje = num(est.saldoTotal), cmcHoje = num(est.cmcMedioPonderado);
      const ant = snapAntMap ? snapAntMap[codProd] : null;
      const saldoAnt = ant ? num(ant[0]) : null;
      const cmcAnt = ant ? num(ant[1]) : null;
      // produto negativo agora -> alerta (dedup por `ref` segura repeticao por 30 dias;
      // assim pegamos tambem os ja-negativos pre-existentes e produtos novos que ja
      // aparecem negativos, nao so a transicao "ficou negativo")
      if (saldoHoje < 0) {
        totaisPorTipo.negativo++;
        if (await gravarAlerta({ conta_omie: contaLabel, tipo: 'negativo', codigo_produto: codProd, descricao_produto: est.descricao || null, ref: `negativo:${conta}:${codProd}`, detalhe: { saldoAnt, saldoHoje, cmc: cmcHoje, codigo: est.codigo, codInt: est.codInt } })) alertasNovos++;
      }
      // CMC caiu muito (requer snapshot anterior com cmc>0)
      if (cmcAnt != null && cmcAnt > 0 && cmcHoje > 0 && cmcHoje < cmcAnt * (1 - pctQueda)) {
        totaisPorTipo.cmc_queda++;
        const pct = (cmcHoje - cmcAnt) / cmcAnt;
        if (await gravarAlerta({ conta_omie: contaLabel, tipo: 'cmc_queda', codigo_produto: codProd, descricao_produto: est.descricao || null, ref: `cmcq:${conta}:${codProd}:${fmtBR(hoje()).split('/').reverse().join('-')}`, detalhe: { cmcAnt, cmcHoje, pct, saldoHoje, codigo: est.codigo } })) alertasNovos++;
      }
    }
    try { await salvarSnapshot(conta, snapHoje); } catch (e) { /* ignora */ }

    // 4. suspeitas de empresa errada (dos negativos)
    for (const p of (resNeg.produtos || [])) {
      if (!p.suspeitaEmpresaErrada) continue;
      totaisPorTipo.suspeita_empresa_errada++;
      if (await gravarAlerta({ conta_omie: contaLabel, tipo: 'suspeita_empresa_errada', codigo_produto: p.codigoProduto, codigo_integracao: p.codigoIntegracao, descricao_produto: p.descricao, ref: `empresaerr:${conta}:${p.codigoProduto}`, detalhe: { saldoAqui: p.saldoTotal, outraEmpresa: p.outraEmpresa } })) alertasNovos++;
    }

    // 5. recebimentos pendentes de garantia de risco
    onProgress(`[${contaLabel}] checando recebimentos pendentes...`);
    let recRisco: any[] = [];
    try {
      const resRec = await analisarRecebimentosPendentes(conta, { onProgress: (m: string) => onProgress(`[${contaLabel}] ${m}`) });
      recRisco = (resRec.recebimentos || []).filter((r: any) => r.temItemRisco);
    } catch (e: any) { onProgress(`[${contaLabel}] aviso: recebimentos falharam (${e.message})`); }
    for (const r of recRisco) {
      totaisPorTipo.recebimento_garantia++;
      const itensRisco = (r.itens || []).filter((it: any) => it.alerta).map((it: any) => ({ prod: it.idProduto, desc: it.descricaoProduto, qtd: it.qtde, custo: it.precoUnit, cmcAtual: it.cmcAtual, cmcProjetado: it.cmcProjetado, impactoPct: it.impactoPct }));
      if (await gravarAlerta({ conta_omie: contaLabel, tipo: 'recebimento_garantia', codigo_produto: null, descricao_produto: `NF ${r.numeroNFe} - ${r.fornecedorNome || ''}`, ref: `receb:${conta}:${r.idReceb || r.chaveNFe || r.numeroNFe}`, detalhe: { idReceb: r.idReceb, numeroNFe: r.numeroNFe, fornecedor: r.fornecedorNome, natureza: r.naturezaOperacao, maiorImpactoPct: r.maiorImpactoPct, itensRisco } })) alertasNovos++;
    }

    // 6. pedidos abertos parados ha mais de N dias na etapa atual
    let pedidosParados = 0;
    if (listarPedidos) {
      try {
        onProgress(`[${contaLabel}] checando pedidos parados...`);
        const peds = await listarPedidos(conta);
        for (const p of (peds || [])) {
          if (!(p.diasParadoEtapa >= diasParadoMin)) continue;
          totaisPorTipo.pedido_parado++;
          pedidosParados++;
          const titulo = `Pedido #${p.numero || p.idPedido} - ${p.nomeCliente || ('cli #' + (p.codigoCliente || '?'))}`;
          if (await gravarAlerta({
            conta_omie: contaLabel, tipo: 'pedido_parado', codigo_produto: null, descricao_produto: titulo,
            ref: `pedparado:${conta}:${p.idPedido}:${p.etapa || '?'}`,
            detalhe: {
              idPedido: p.idPedido, numero: p.numero, etapa: p.etapa, etapaNome: p.etapaNome,
              diasParado: p.diasParadoEtapa, diasAberto: p.diasAberto,
              dataInclusao: p.dataInclusao, dataAlteracao: p.dataAlteracao,
              criadoPor: p.criadoPorNome || p.criadoPorLogin,
              cliente: p.nomeCliente, codigoCliente: p.codigoCliente, valor: p.valorTotal
            }
          })) alertasNovos++;
        }
      } catch (e: any) { onProgress(`[${contaLabel}] aviso: pedidos parados falhou (${e.message})`); }
    }

    resumoContas.push({ conta: contaLabel, totalProdutos: resNeg.totalProdutos, totalNegativos: resNeg.totalNegativos, totalSuspeitas: resNeg.totalSuspeitas, recebimentosRisco: recRisco.length, pedidosParados });
  }

  return { rodadoEm: new Date().toISOString(), duracaoMs: Date.now() - t0, contas: resumoContas, alertasNovos, totaisPorTipo };
}
