/* eslint-disable @typescript-eslint/no-explicit-any */
// As respostas/params crus da API Omie nao tem schema fixo (chaves variam por
// versao/config). `any` aqui e' deliberado e contido a este arquivo de glue.
// =============================================================================
// Cliente da API Omie + funcoes especificas deste projeto (NF de entrada,
// posicao de estoque / CMC, ajuste de estoque). Multi-conta NOVA/CASTRO.
//
// Padrao herdado dos outros projetos do ecossistema:
//  - omieRequest(endpoint, call, params, conta, tentativa=1) com retry
//  - paginacao confiando em "total_de_paginas" / "nTotPaginas"
//  - sleep entre paginas para nao tomar rate limit ("Too many requests")
//
// ATENCAO: alguns nomes de campo das respostas da Omie (ListarNotaEnt,
// MovimentoEstoque) variam e nao estao 100% documentados. As funcoes de
// normalizacao abaixo sao defensivas (tentam varias chaves) e logam o primeiro
// registro cru para facilitar o ajuste em runtime. Procure por "[DEBUG omie]".
//
// Portado 1:1 de src/omie-api.js (CommonJS) para TypeScript. Credenciais,
// sleep/num e fmtBR/hoje agora vem dos modulos de apoio do modulo Ajustes.
// =============================================================================

import type { Conta } from './conta';
import { decodeOmieTexto } from '@/lib/omie/texto';
import { getCredentials } from './conta';
import { sleep, num } from './utils';
import { fmtBR, hoje } from './dates';

// Re-exports (outros modulos importam estes simbolos a partir de omie.ts).
export { getCredentials, getContasOmie, labelConta } from './conta';
export { sleep } from './utils';
export { fmtBR } from './dates';

const OMIE_BASE_URL = 'https://app.omie.com.br/api/v1';
export const PAGE_SIZE = 500;          // a Omie costuma capar em ~100/pagina mesmo assim
export const SLEEP_BETWEEN_PAGES = 2000;

// Error com propriedades customizadas que a Omie produz.
interface OmieError extends Error {
  faultstring?: string;
  bloqueio?: boolean;
  aguardarSegundos?: number;
}

function omieError(msg: string, extra?: { faultstring?: string; bloqueio?: boolean; aguardarSegundos?: number }): OmieError {
  const e = new Error(msg) as OmieError;
  if (extra?.faultstring) e.faultstring = extra.faultstring;
  if (extra?.bloqueio) e.bloqueio = extra.bloqueio;
  if (extra?.aguardarSegundos) e.aguardarSegundos = extra.aguardarSegundos;
  return e;
}

export async function omieRequest(
  endpoint: string,
  call: string,
  params: Record<string, any>,
  conta: Conta,
  tentativa = 1
): Promise<any> {
  const { appKey, appSecret } = getCredentials(conta);
  let res: Response;
  try {
    // Encoding: o Omie NAO aceita "charset=utf-8" no Content-Type (devolve
    // SOAP/XML se mandar) E tambem strippa caracteres non-ASCII quando o body
    // vem em UTF-8 cru. Solucao: escapar todos os codepoints >= U+0080 como
    // \uXXXX no JSON. O body fica 100% ASCII e o Omie decoda de volta certo
    // (ex.: "peça" -> "peça" na string que ele armazena).
    const bodyAscii = JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param: [params] })
      .replace(/[-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
    res = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyAscii
    });
  } catch (e) {
    // Falha de rede (DNS, timeout, conexao recusada, etc) - retry com backoff
    if (tentativa <= 3) {
      const espera = tentativa * 5000;
      console.log(`[omie ${conta}] rede falhou (${(e as OmieError).message}) - retry em ${espera / 1000}s (tentativa ${tentativa}/3)`);
      await sleep(espera);
      return omieRequest(endpoint, call, params, conta, tentativa + 1);
    }
    throw e;
  }
  const data = await res.json();
  // Omie tem 2 formatos de erro: (1) {faultstring:"ERROR:..."} - SOAP-style,
  // (2) {status:"error", message:"..."} - REST-style (ex.: "Method not exists").
  // O segundo era invisivel antes desta normalizacao e gerava falsos positivos
  // de sucesso (ex.: CancelarPedido inexistente "passava" e o pedido nao era cancelado).
  const erroREST = data && data.status === 'error' ? String(data.message || 'erro Omie sem mensagem') : null;
  if (erroREST && !data.faultstring) {
    throw omieError(`Omie API: ${erroREST}`, { faultstring: erroREST });
  }
  if (data && data.faultstring) {
    const fs = String(data.faultstring);
    // Bloqueio LONGO da Omie ("API bloqueada por consumo indevido. Tente
    // novamente em N segundos.") - NAO adianta re-tentar (o bloqueio dura
    // minutos). Falha rapido p/ nao estourar o timeout do gateway (que
    // devolveria "upstream error" em vez do JSON).
    // Cuidado: "bloquead" solto pegava erros de NEGOCIO ("O período contábil
    // de Abril... foi bloqueado") e abortava lotes inteiros por engano.
    if (/api bloqueada|consumo indevido/i.test(fs)) {
      const mSeg = fs.match(/(\d+)\s*segundos?/i);
      const mMin = fs.match(/(\d+)\s*minutos?/i);
      const aguardarSegundos = mSeg ? parseInt(mSeg[1], 10) : mMin ? parseInt(mMin[1], 10) * 60 : 60;
      throw omieError(`Omie API: ${fs}`, { faultstring: fs, bloqueio: true, aguardarSegundos });
    }
    // Erros "transitorios" da Omie que valem retry com backoff:
    //  - "Too many requests" / "REDUNDANT" (rate limit padrao)
    //  - "Ja existe uma requisicao desse metodo sendo executada" (concorrencia)
    //  - "Consumo redundante" / "SOAP" ocasionais
    //  - "SOAP-ERROR: Broken response from Application Server (BG)" (o
    //    backend da Omie engasgou; passa numa nova tentativa)
    const isTransiente = /too many requests/i.test(fs)
      || /soap-error|broken response/i.test(fs)
      || /redundant/i.test(fs)
      || /j[aá] existe uma requisi/i.test(fs)
      || /requisi[cç][aã]o desse m[ée]todo/i.test(fs)
      || /tente novamente|tentar novamente/i.test(fs);
    if (isTransiente && tentativa <= 4) {
      const espera = tentativa * 6000;
      console.log(`[omie ${conta}] ${call}: transitorio ("${fs.slice(0, 60)}...") - aguardando ${espera / 1000}s (tentativa ${tentativa}/4)`);
      await sleep(espera);
      return omieRequest(endpoint, call, params, conta, tentativa + 1);
    }
    throw omieError(`Omie API: ${fs}`, { faultstring: fs });
  }
  return data;
}

// True quando o erro da Omie indica "nenhum registro encontrado" (fim da
// paginacao com lista vazia) - nesse caso paramos sem propagar.
function ehErroSemRegistros(e: any): boolean {
  return !!(e && e.faultstring && /n[aã]o.*registr|nenhum.*registr|ERROR.*registr/i.test(e.faultstring));
}

interface PaginarOpts {
  paginaKey?: string;
  regKey?: string;
  regValue?: number;
  totalKeys?: string[];
  listaKeys?: string[];
  onPagina?: (lista: any[], pagina: number, totalPaginas: number, respostaCrua: any) => any;
  debugTag?: string;
}

// Helper generico de paginacao. Cada API Omie usa nomes diferentes para
// pagina/registros/total/lista - passamos esses nomes como opcoes.
//   opts.paginaKey   - nome do parametro de pagina (ex: 'pagina', 'nPagina')
//   opts.regKey      - nome do parametro de registros por pagina
//   opts.regValue    - valor de registros por pagina (default PAGE_SIZE)
//   opts.totalKeys   - nomes possiveis do total de paginas na resposta
//   opts.listaKeys   - nomes possiveis do array de itens na resposta
//   opts.onPagina(lista, pagina, totalPaginas, respostaCrua)
//   opts.debugTag    - prefixo para logs de debug do 1o registro
export async function paginarOmie(
  endpoint: string,
  call: string,
  baseParams: Record<string, any>,
  conta: Conta,
  opts: PaginarOpts = {}
): Promise<{ itens: any[]; totalPaginas: number }> {
  const paginaKey = opts.paginaKey || 'pagina';
  const regKey = opts.regKey || 'registros_por_pagina';
  const regValue = opts.regValue || PAGE_SIZE;
  const totalKeys = opts.totalKeys || ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas'];
  const listaKeys = opts.listaKeys || [];
  const debugTag = opts.debugTag || call;

  const tudo: any[] = [];
  let pagina = 1;
  let totalPaginas = 0;
  let debugado = false;

  while (true) {
    let r: any;
    try {
      r = await omieRequest(endpoint, call, {
        ...baseParams,
        [paginaKey]: pagina,
        [regKey]: regValue
      }, conta);
    } catch (e) {
      if (ehErroSemRegistros(e)) break;
      throw e;
    }

    for (const tk of totalKeys) {
      if (r && Number(r[tk]) > 0) { totalPaginas = Number(r[tk]); break; }
    }

    let lista: any[] | null = null;
    for (const lk of listaKeys) {
      if (Array.isArray(r && r[lk])) { lista = r[lk]; break; }
    }
    if (!Array.isArray(lista)) {
      // Tenta achar o primeiro array no objeto (fallback se a chave mudou)
      if (r && typeof r === 'object') {
        const arrKey = Object.keys(r).find(k => Array.isArray(r[k]));
        if (arrKey) {
          if (!debugado) console.log(`[DEBUG omie ${debugTag}] usando chave de lista inferida: "${arrKey}"`);
          lista = r[arrKey];
        }
      }
    }
    lista = Array.isArray(lista) ? lista : [];

    if (!debugado && lista.length > 0) {
      debugado = true;
      console.log(`[DEBUG omie ${debugTag}] keys resposta: ${Object.keys(r || {}).join(', ')}`);
      console.log(`[DEBUG omie ${debugTag}] item[0]: ${JSON.stringify(lista[0]).slice(0, 800)}`);
    }

    if (typeof opts.onPagina === 'function') {
      await opts.onPagina(lista, pagina, totalPaginas, r);
    }
    tudo.push(...lista);

    if (lista.length === 0) break;
    if (totalPaginas > 0) {
      if (pagina >= totalPaginas) break;
    } else if (lista.length < regValue) {
      break;
    }
    pagina++;
    await sleep(SLEEP_BETWEEN_PAGES);
  }

  return { itens: tudo, totalPaginas };
}

// =============================================================================
// Locais de estoque
// =============================================================================
// Retorna [{ id, nome, padrao }] dos locais ativos.
export async function listarLocaisEstoque(conta: Conta): Promise<any[]> {
  const locais: any[] = [];
  const { itens } = await paginarOmie('/estoque/local/', 'ListarLocaisEstoque', {}, conta, {
    paginaKey: 'nPagina', regKey: 'nRegPorPagina', regValue: 500,
    totalKeys: ['nTotPaginas', 'total_de_paginas'],
    listaKeys: ['locaisEncontrados', 'cadastros', 'lista'],
    debugTag: 'ListarLocaisEstoque'
  });
  for (const l of itens) {
    if (l && l.inativo === 'S') continue;
    const id = l && (l.codigo_local_estoque ?? l.nCodLocal ?? l.codigo);
    if (id == null) continue;
    locais.push({
      id,
      nome: (l.descricao || l.cDescricao || l.codigo || String(id)),
      padrao: l.padrao === 'S' || l.cPadrao === 'S'
    });
  }
  return locais;
}

// =============================================================================
// Posicao de estoque (saldo + CMC)
// =============================================================================

// Le a posicao de estoque de TODOS os produtos, iterando cada local ativo.
// Retorna Map<codigoProduto, { porLocal:[{localId,localNome,saldo,cmc}],
//   saldoTotal, cmcMedioPonderado }>.
export async function obterPosicaoEstoqueBulk(conta: Conta, opts: Record<string, any> = {}): Promise<Map<any, any>> {
  const locais = await listarLocaisEstoque(conta);
  if (opts.onProgress) opts.onProgress(`${locais.length} locais de estoque`);
  await sleep(SLEEP_BETWEEN_PAGES);
  if (locais.length === 0) throw new Error('Nenhum local de estoque ativo encontrado');

  // dataPosicaoBR permite consultar a posicao numa data passada (ex.: fim do mes de
  // referencia do arquivo Mahindra). Default = hoje.
  const dataPos = opts.dataPosicaoBR || fmtBR(hoje());
  const acc = new Map<any, any>(); // id -> { porLocal: Map<localId,{localNome,saldo,cmc}> }

  for (const local of locais) {
    const { itens } = await paginarOmie('/estoque/consulta/', 'ListarPosEstoque', {
      dDataPosicao: dataPos,
      cExibeTodos: 'S',
      codigo_local_estoque: local.id
    }, conta, {
      paginaKey: 'nPagina', regKey: 'nRegPorPagina', regValue: 500,
      totalKeys: ['nTotPaginas', 'total_de_paginas'],
      listaKeys: ['produtos', 'lista', 'posicao'],
      debugTag: 'ListarPosEstoque'
    });
    for (const p of itens) {
      const id = p && (p.nCodProd ?? p.codigo_produto ?? p.nCodProduto);
      if (id == null) continue;
      const saldo = num(p.nSaldo ?? p.fisico ?? p.nFisico ?? p.saldo);
      const cmc = num(p.nCMC ?? p.cmc ?? p.nValorCMC);
      let entry = acc.get(id);
      if (!entry) { entry = { porLocal: new Map(), descricao: null, codInt: null, codigo: null, precoUnitario: 0 }; acc.set(id, entry); }
      if (!entry.descricao && (p.cDescricao || p.descricao)) entry.descricao = p.cDescricao || p.descricao;
      if (!entry.codInt && p.cCodInt) entry.codInt = p.cCodInt;
      if (!entry.codigo && (p.cCodigo || p.codigo)) entry.codigo = p.cCodigo || p.codigo;
      if (!entry.precoUnitario && (p.nPrecoUnitario || p.nPreco)) entry.precoUnitario = num(p.nPrecoUnitario ?? p.nPreco);
      const prev = entry.porLocal.get(local.id) || { localId: local.id, localNome: local.nome, saldo: 0, cmc: 0 };
      prev.saldo += saldo;
      // Se ja havia um cmc nesse local (nao deveria), mantem o maior > 0
      if (cmc > 0) prev.cmc = cmc;
      entry.porLocal.set(local.id, prev);
    }
    if (opts.onProgress) opts.onProgress(`local "${local.nome}": ${itens.length} produtos`);
    await sleep(SLEEP_BETWEEN_PAGES);
  }

  const mapa = new Map<any, any>();
  for (const [id, entry] of acc) {
    const porLocal = [...entry.porLocal.values()];
    let somaSaldo = 0, somaPond = 0, somaPeso = 0;
    for (const pl of porLocal) {
      somaSaldo += pl.saldo;
      if (pl.cmc > 0) {
        const peso = pl.saldo > 0 ? pl.saldo : 1;
        somaPond += pl.cmc * peso;
        somaPeso += peso;
      }
    }
    mapa.set(id, {
      porLocal,
      saldoTotal: somaSaldo,
      cmcMedioPonderado: somaPeso > 0 ? somaPond / somaPeso : 0,
      descricao: entry.descricao || null,
      codInt: entry.codInt || null,
      codigo: entry.codigo || null,
      precoUnitario: entry.precoUnitario || 0
    });
  }
  return mapa;
}

// Le a posicao de estoque de UM produto num local especifico (ou consolidada
// se codigoLocalEstoque=0). Usado no momento de aplicar a correcao - sempre
// re-le do Omie, nunca confia no cache.
// Retorna { saldo, fisico, cmc }.
export async function obterPosicaoEstoqueProduto(conta: Conta, codigoProduto: any, opts: Record<string, any> = {}): Promise<any> {
  const codigoLocalEstoque = opts.codigoLocalEstoque ?? 0;
  const data = await omieRequest('/estoque/consulta/', 'PosicaoEstoque', {
    id_prod: Number(codigoProduto) || codigoProduto,
    codigo_local_estoque: codigoLocalEstoque,
    cod_int: ''
  }, conta);
  return {
    saldo: num(data && (data.saldo ?? data.nSaldo)),
    fisico: num(data && (data.fisico ?? data.nFisico ?? data.saldo)),
    cmc: num(data && (data.cmc ?? data.nCMC ?? data.nValorCMC))
  };
}

// =============================================================================
// Notas fiscais de ENTRADA (recebidas de fornecedores)
// /produtos/notaentrada/ -> ListarNotaEnt (filtro por data de ALTERACAO).
// Alternativa documentada: /produtos/nfconsultar/ -> ListarNF com tpNF=0.
// =============================================================================

// Normaliza um registro de NF de entrada (ListarNotaEnt, modo detalhado).
// Estrutura real observada: { cabec:{cNumeroNotaEnt,nCodNotaEnt,nCodCli,dPrevisao,...},
//   produtos:[{cCFOP,nCodProd,nCodIt,cCodInt,nQtde,nValUnit,nDesconto,codigo_local_estoque,...}],
//   infAdic, obs:{cObs}, email:{cEmail}, totais:{...} }.
// Retorna { numero, codNotaEnt, idFornecedor, dataRef (DD/MM/YYYY), cancelada,
//   obs, itens:[{ codigoProduto, codigoIntegracao, codItem, cfop, localItem,
//   qtde, valUnit, desconto, valTotal }] }.
export function normalizarNotaEntrada(nf: any): any {
  if (!nf || typeof nf !== 'object') return null;
  const cabec = nf.cabec || nf.cabecalho || nf.ide || {};
  const numero = cabec.cNumeroNotaEnt ?? cabec.cNumero ?? cabec.nNumero ?? cabec.nNF ?? null;
  const codNotaEnt = cabec.nCodNotaEnt ?? cabec.nCodNF ?? null;
  const idFornecedor = cabec.nCodCli ?? cabec.nCodFor ?? cabec.nIdCliente ?? null;
  const dataEntrada = cabec.dDtEntrada ?? cabec.dEntrada ?? cabec.dDtEntradaNF ?? null;
  const dataEmissao = cabec.dDtEmissao ?? cabec.dEmissao ?? cabec.dEmi ?? null;
  const dataPrevisao = cabec.dPrevisao ?? null;
  const dataAlteracao = cabec.dDtAlteracao ?? (nf.info && nf.info.dAlt) ?? null;
  const dataRef = dataEntrada || dataEmissao || dataPrevisao || dataAlteracao || null;
  const sit = String(cabec.cStatus ?? cabec.cSituacao ?? nf.cStatus ?? '').toUpperCase();
  const cancelada = sit === 'C' || sit === 'CANCELADA' || nf.cancelamento === 'S';

  const detArr = Array.isArray(nf.produtos) ? nf.produtos : (Array.isArray(nf.det) ? nf.det : (Array.isArray(nf.itens) ? nf.itens : []));
  const itens: any[] = [];
  for (const d of detArr) {
    const prod = (d && (d.produto || d.prod)) || d || {};
    const codigoProduto = prod.nCodProd ?? prod.codigo_produto ?? d.nCodProd ?? null;
    const codigoIntegracao = prod.cCodInt ?? prod.cCodIntProd ?? prod.codigo_produto_integracao ?? null;
    const codItem = prod.nCodIt ?? d.nCodIt ?? null;
    const descricao = prod.cDescricao ?? prod.descricao ?? prod.xProd ?? null;
    const cfop = prod.cCFOP ?? prod.cfop ?? prod.CFOP ?? d.cCFOP ?? null;
    const localItem = prod.codigo_local_estoque ?? d.codigo_local_estoque ?? null;
    const qtde = num(prod.nQtde ?? prod.quantidade ?? d.nQtde);
    const valUnit = num(prod.nValUnit ?? prod.valor_unitario ?? d.nValUnit);
    const desconto = num(prod.nDesconto ?? d.nDesconto);
    let valTotal = num(prod.nValorTotal ?? prod.valor_total);
    if (!valTotal) valTotal = qtde * valUnit - desconto;
    if (codigoProduto == null && codigoIntegracao == null) continue;
    itens.push({ codigoProduto, codigoIntegracao, codItem, descricao, cfop, localItem, qtde, valUnit, desconto, valTotal });
  }

  return {
    numero: numero != null ? String(numero) : null,
    codNotaEnt,
    serie: cabec.cSerie != null ? String(cabec.cSerie) : null,
    dataEntrada: dataEntrada || null,
    dataEmissao: dataEmissao || null,
    dataPrevisao: dataPrevisao || null,
    dataAlteracao: dataAlteracao || null,
    dataRef,
    idFornecedor,
    nomeFornecedor: cabec.cRazaoCli ?? cabec.cNomeCli ?? cabec.cRazaoSocial ?? null,
    email: (nf.email && nf.email.cEmail) || null,
    obs: (nf.obs && (nf.obs.cObs || nf.obs.cDadosAdic)) || (nf.infAdic && nf.infAdic.cDadosAdic) || null,
    cancelada: !!cancelada,
    itens,
    raw: nf
  };
}

// Lista NFs de entrada da conta entre duas datas (DD/MM/YYYY) - filtro por data
// de ALTERACAO (a unica que ListarNotaEnt oferece). Retorna array normalizado.
export async function listarNotasEntrada(conta: Conta, dataDeBR: string, dataAteBR: string, opts: Record<string, any> = {}): Promise<any[]> {
  const { itens } = await paginarOmie('/produtos/notaentrada/', 'ListarNotaEnt', {
    dtAltDe: dataDeBR,
    dtAltAte: dataAteBR,
    cExibirDetalhes: 'S',
    cOrdenarPor: 'CODIGO'
  }, conta, {
    paginaKey: 'nPagina', regKey: 'nRegistrosPorPagina', regValue: 100,
    totalKeys: ['nTotalPaginas', 'nTotPaginas', 'total_de_paginas'],
    listaKeys: ['notas', 'nfEntradaConsulta', 'nfEntrada', 'cadNotaEnt', 'notaEntrada', 'lista', 'cadastros'],
    debugTag: 'ListarNotaEnt',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`ListarNotaEnt pag ${pag}/${tot || '?'}: ${lista.length} NFs`);
    }
  });
  return itens.map(normalizarNotaEntrada).filter(Boolean);
}

// =============================================================================
// Notas fiscais de SAIDA (vendas) - /produtos/nfconsultar/ -> ListarNF (tpNF=1).
// Usado pelo "Arquivo Mahindra" pra somar a quantidade vendida por peca no mes.
// ATENCAO: nomes de filtro e de tags do retorno do ListarNF variam por versao/
// config - validar em runtime (ver "[DEBUG omie ListarNF]"). A normalizacao
// abaixo e' defensiva (tenta varias chaves) seguindo o padrao do arquivo.
// =============================================================================
export function normalizarNFSaida(nf: any): any {
  if (!nf || typeof nf !== 'object') return null;
  const cab = nf.cabecalho || nf.ide || {};
  const ide = nf.ide || {};
  const compl = nf.compl || {};
  const dest = nf.nfDestInt || nf.dest || nf.destinatario || {};
  const numero = cab.nNF ?? cab.nNumero ?? ide.cNF ?? ide.nNF ?? null;
  // codigo INTERNO da NF no Omie - chave do GetUrlDanfe / dfedocs (fica em ide.nCodNF)
  const nCodNF = ide.nCodNF ?? compl.nIdNF ?? cab.nCodNF ?? cab.nIdNF ?? null;
  const serie = ide.serie ?? ide.cSerie ?? cab.serie ?? null;
  const chaveNFe = compl.cChaveNFe ?? compl.cChaveNfe ?? nf.cChaveNFe ?? null;
  const dataEmissao = ide.dEmi ?? ide.dDtEmissao ?? cab.dEmi ?? null;
  // valor total: total.ICMSTot.vNF (defensivo p/ variacoes de chave)
  const tot = nf.total || {};
  const icmsTot = tot.ICMSTot || tot.icmstot || tot.icms_tot || {};
  const valorNF = num(icmsTot.vNF ?? icmsTot.vnf ?? tot.vNF ?? compl.nValorNF);
  // destinatario / cliente
  const clienteCodigo = dest.nCodCli ?? dest.codigo_cliente ?? null;
  const clienteNome = dest.cRazao ?? dest.cNome ?? dest.razao_social ?? dest.xNome ?? null;
  const clienteDoc = dest.cnpj_cpf ?? dest.cCnpjCpf ?? dest.CNPJ ?? dest.CPF ?? null;
  // status / cancelamento (campos variam entre versoes do ListarNF)
  const status = String(
    (nf.compl && (nf.compl.cnf_status || nf.compl.status || nf.compl.cStatus)) ||
    nf.nfStatus || cab.cStatus || cab.cSituacao || ''
  ).toUpperCase();
  const cancelada = /CANCEL|DENEG/.test(status)
    || nf.cancelamento === 'S'
    || (nf.compl && (nf.compl.cancelado === 'S' || nf.compl.cnf_canc === 'S'));
  const detArr = Array.isArray(nf.det) ? nf.det : (Array.isArray(nf.produtos) ? nf.produtos : []);
  const itens: any[] = [];
  for (const d of detArr) {
    const prod = (d && (d.prod || d.produto)) || d || {};
    const codigo = prod.cProd ?? prod.codigo ?? prod.cCodigo ?? null;        // SKU do cadastro (= "codigo da peca")
    const codigoProduto = prod.nCodProd ?? prod.codigo_produto ?? null;
    const descricao = prod.xProd ?? prod.descricao ?? prod.cDescricao ?? null;
    const cfop = prod.CFOP ?? prod.cfop ?? prod.cCFOP ?? null;
    const qtde = num(prod.qCom ?? prod.nQtde ?? prod.quantidade ?? prod.qtde);
    const valUnit = num(prod.vUnCom ?? prod.nValUnit ?? prod.valor_unitario);
    const valItem = num(prod.vProd ?? prod.nValorTotal ?? prod.valor_total) || (qtde * valUnit);
    if (codigo == null && codigoProduto == null) continue;
    itens.push({ codigo, codigoProduto, descricao, cfop, qtde, valUnit, valItem });
  }
  return {
    numero: numero != null ? String(numero) : null,
    nCodNF: nCodNF != null ? Number(nCodNF) || nCodNF : null,
    serie: serie != null ? String(serie) : null,
    chaveNFe: chaveNFe != null ? String(chaveNFe) : null,
    dataEmissao,
    valorNF,
    clienteCodigo: clienteCodigo != null ? Number(clienteCodigo) || clienteCodigo : null,
    clienteNome: clienteNome != null ? String(clienteNome) : null,
    clienteDoc: clienteDoc != null ? String(clienteDoc) : null,
    cancelada: !!cancelada,
    itens,
    raw: nf
  };
}

// Lista NF-e de saida (vendas) entre duas datas de EMISSAO (DD/MM/YYYY).
// Retorna array normalizado. Paginado.
export async function listarNotasSaida(conta: Conta, dataDeBR: string, dataAteBR: string, opts: Record<string, any> = {}): Promise<any[]> {
  const { itens } = await paginarOmie('/produtos/nfconsultar/', 'ListarNF', {
    // dEmiInicial/dEmiFinal = filtro por DATA DE EMISSAO (validado em runtime: e' o
    // unico que de fato restringe a janela; "filtrar_por_data_de/ate" sozinho e'
    // ignorado pelo ListarNF e traz o historico inteiro).
    dEmiInicial: dataDeBR,
    dEmiFinal: dataAteBR,
    tpNF: 1,                          // 1 = saida (venda)
    apenas_importado_api: 'N'
  }, conta, {
    paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 100,
    totalKeys: ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas'],
    listaKeys: ['nfCadastro', 'nf_cadastro', 'nota_fiscal', 'lista', 'cadastros'],
    debugTag: 'ListarNF',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`ListarNF pag ${pag}/${tot || '?'}: ${lista.length} NFs de saida`);
    }
  });
  return itens.map(normalizarNFSaida).filter(Boolean);
}

// Busca NF-e de saida com filtros nativos do ListarNF (usado pela aba "Notas
// fiscais"). filtros aceita: { nNFInicial, nNFFinal, dEmiInicial, dEmiFinal,
// nIdCliente, cnpj_cpf }. Tudo opcional; campos vazios sao omitidos. Retorna
// array normalizado (normalizarNFSaida) - inclui nCodNF p/ o DANFE e cliente.
export async function buscarNotasSaida(conta: Conta, filtros: Record<string, any> = {}, opts: Record<string, any> = {}): Promise<any[]> {
  const base: Record<string, any> = { tpNF: 1, apenas_importado_api: 'N' };
  if (filtros.nNFInicial != null && filtros.nNFInicial !== '') base.nNFInicial = Number(filtros.nNFInicial);
  if (filtros.nNFFinal != null && filtros.nNFFinal !== '') base.nNFFinal = Number(filtros.nNFFinal);
  if (filtros.dEmiInicial) base.dEmiInicial = filtros.dEmiInicial;
  if (filtros.dEmiFinal) base.dEmiFinal = filtros.dEmiFinal;
  if (filtros.nIdCliente != null && filtros.nIdCliente !== '') base.nIdCliente = Number(filtros.nIdCliente);
  if (filtros.cnpj_cpf) base.cnpj_cpf = String(filtros.cnpj_cpf);
  const { itens } = await paginarOmie('/produtos/nfconsultar/', 'ListarNF', base, conta, {
    paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 100,
    totalKeys: ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas'],
    listaKeys: ['nfCadastro', 'nf_cadastro', 'nota_fiscal', 'lista', 'cadastros'],
    debugTag: 'ListarNF',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`ListarNF pag ${pag}/${tot || '?'}: ${lista.length} NFs`);
    }
  });
  return itens.map(normalizarNFSaida).filter(Boolean);
}

// Obtem a URL do DANFE (PDF completo) de uma NF-e de saida a partir do codigo
// interno da NF no Omie (nCodNF). /produtos/notafiscalutil/ -> GetUrlDanfe.
// Retorna { url, validadeAte }. A URL e' temporaria (dtValUrl).
export async function obterUrlDanfe(conta: Conta, nCodNF: any): Promise<any> {
  if (nCodNF == null || nCodNF === '') throw new Error('informe o nCodNF da nota');
  const r = await omieRequest('/produtos/notafiscalutil/', 'GetUrlDanfe', { nCodNF: Number(nCodNF) }, conta);
  const url = r && (r.cUrlDanfe || r.cUrlDANFE || r.url);
  if (!url) {
    throw omieError('Omie nao retornou a URL do DANFE para esta nota', {
      faultstring: (r && (r.cDescStatus || r.cDesStatus)) || 'sem cUrlDanfe na resposta'
    });
  }
  return { url: String(url), validadeAte: r.dtValUrl || null, raw: r };
}

// =============================================================================
// Notas fiscais de SERVICO (NFS-e) - /servicos/nfse/ -> ListarNFSEs.
// API e estrutura proprias (nao e' a mesma da NF-e de produto). O PDF vem de
// /servicos/osdocs/ -> ObterNFSe (usa o nCodNF como nIdNf). Estrutura validada
// em runtime (NOVA): item tem sub-objetos Cabecalho/Emissao/Valores/...; o
// Cabecalho ja traz cRazaoDestinatario (nome do cliente) e a data fica em
// Emissao.cDataEmissao. Normalizacao defensiva ("[DEBUG omie ListarNFSEs]").
// =============================================================================
export function normalizarNFSe(nf: any): any {
  if (!nf || typeof nf !== 'object') return null;
  const cab = nf.Cabecalho || nf.cabecalho || nf.cabec || {};
  const pick = (...objs: any[]) => objs.find(o => o && typeof o === 'object') || {};
  const emis = pick(nf.Emissao, nf.emissao);
  const vals = pick(nf.Valores, nf.valores);

  const numero = cab.nNumeroNFSe ?? nf.nNumeroNFSe ?? cab.cNumero ?? cab.nNumero ?? null;
  // nCodNF = id interno do documento (serve de nIdNf no ObterNFSe / PDF)
  const nCodNF = cab.nCodNF ?? nf.nCodNF ?? cab.nIdNF ?? nf.nIdNF ?? null;
  const serie = cab.cSerieNFSe ?? nf.cSerieNFSe ?? cab.cSerie ?? null;
  const dataEmissao = cab.cDataEmissao ?? nf.cDataEmissao ?? emis.dEmissao ?? emis.cDataEmissao ?? cab.dEmissao ?? null;
  const valorNF = num(cab.nValorNFSe ?? nf.nValorNFSe ?? vals.nValorServico ?? vals.nValorTotalNF ?? vals.nValorNFSe);
  const status = String(cab.cStatusNFSe ?? nf.cStatusNFSe ?? cab.cStatus ?? '').toUpperCase();
  // cStatusNFSe: C=Cancelada, F=Faturada (emitida), N=Nao faturada
  const cancelada = status === 'C' || !!(nf.Cancelamento && (nf.Cancelamento.dCancelamento || nf.Cancelamento.cMotivo));
  const clienteCodigo = cab.nCodigoCliente ?? nf.nCodigoCliente ?? cab.nCodCli ?? null;
  const docCnpj = cab.cCNPJDestinatario ?? nf.cCNPJDestinatario ?? null;
  const docCpf = cab.cCPFDestinatario ?? nf.cCPFDestinatario ?? null;
  const clienteDoc = (docCnpj && String(docCnpj).replace(/\D/g, '')) || (docCpf && String(docCpf).replace(/\D/g, '')) || null;
  const clienteNome = cab.cRazaoDestinatario ?? cab.cRazaoSocial ?? cab.cNomeCliente ?? nf.cRazaoDestinatario ?? null;

  return {
    tipo: 'servico',
    numero: numero != null ? String(numero) : null,
    nCodNF: nCodNF != null ? (Number(nCodNF) || nCodNF) : null,
    serie: serie != null ? String(serie) : null,
    chaveNFe: null,
    dataEmissao: dataEmissao || null,
    valorNF,
    clienteCodigo: clienteCodigo != null ? (Number(clienteCodigo) || clienteCodigo) : null,
    clienteNome: clienteNome != null ? String(clienteNome) : null,
    clienteDoc: clienteDoc || null,
    cancelada: !!cancelada,
    raw: nf
  };
}

// Busca NFS-e com filtros nativos do ListarNFSEs. filtros aceita:
// { nNumeroNFSe, dEmiInicial, dEmiFinal, nCodigoCliente, cCNPJDestinatario,
//   cCPFDestinatario }. Tudo opcional; vazios sao omitidos. Retorna array
// normalizado (normalizarNFSe) - inclui nCodNF p/ o PDF e codigo do cliente.
export async function buscarNotasServico(conta: Conta, filtros: Record<string, any> = {}, opts: Record<string, any> = {}): Promise<any[]> {
  const base: Record<string, any> = {};
  if (filtros.nNumeroNFSe != null && filtros.nNumeroNFSe !== '') base.nNumeroNFSe = String(filtros.nNumeroNFSe);
  if (filtros.dEmiInicial) base.dEmiInicial = filtros.dEmiInicial;
  if (filtros.dEmiFinal) base.dEmiFinal = filtros.dEmiFinal;
  if (filtros.nCodigoCliente != null && filtros.nCodigoCliente !== '') base.nCodigoCliente = Number(filtros.nCodigoCliente);
  if (filtros.cCNPJDestinatario) base.cCNPJDestinatario = String(filtros.cCNPJDestinatario);
  if (filtros.cCPFDestinatario) base.cCPFDestinatario = String(filtros.cCPFDestinatario);
  const { itens } = await paginarOmie('/servicos/nfse/', 'ListarNFSEs', base, conta, {
    paginaKey: 'nPagina', regKey: 'nRegPorPagina', regValue: 100,
    totalKeys: ['nTotPaginas', 'total_de_paginas', 'nTotalPaginas'],
    listaKeys: ['nfseEncontradas', 'nfseLista', 'nfse_encontradas', 'lista', 'cadastros'],
    debugTag: 'ListarNFSEs',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`ListarNFSEs pag ${pag}/${tot || '?'}: ${lista.length} NFS-e`);
    }
  });
  return itens.map(normalizarNFSe).filter(Boolean);
}

// Obtem a URL do PDF de uma NFS-e a partir do codigo interno (nCodNF, usado como
// nIdNf). /servicos/osdocs/ -> ObterNFSe. Retorna { url, validadeAte, xml, prefeitura }.
export async function obterUrlNFSePdf(conta: Conta, nCodNF: any): Promise<any> {
  if (nCodNF == null || nCodNF === '') throw new Error('informe o nCodNF da NFS-e');
  const r = await omieRequest('/servicos/osdocs/', 'ObterNFSe', { nIdNf: Number(nCodNF) || nCodNF }, conta);
  const url = r && (r.cPdfNFSe || r.cUrlNFSe || r.cPdf || r.url);
  if (!url) {
    throw omieError('Omie nao retornou o PDF da NFS-e', {
      faultstring: (r && (r.cDescStatus || r.cDesStatus)) || 'sem cPdfNFSe na resposta'
    });
  }
  return { url: String(url), validadeAte: null, xml: r.cXmlNFSe || null, prefeitura: r.cUrlNFSe || null, raw: r };
}

// =============================================================================
// Recebimento de NF-e (NFs de fornecedor ainda nao processadas em nota de entrada)
// /produtos/recebimentonfe/ -> ListarRecebimentos / ConsultarRecebimento.
// Estrutura observada: { recebimentos:[{ cabec:{cNumeroNFe,cChaveNFe,cEtapa,
//   cNaturezaOperacao,cNome,cRazaoSocial,cSerieNFe,dEmissaoNFe,nIdFornecedor,
//   nIdReceb,nValorNFe,cCNPJ_CPF}, infoCadastro:{cRecebido,cCancelada,cFaturado,
//   cBloqueado,cDevolvido,...}, itensRecebimento:[{itensCabec:{cCFOP (CFOP do
//   fornecedor!),cCodigoProduto,cDescricaoProduto,nIdProduto (0=produto novo),
//   nQtdeNFe,nPrecoUnit,vTotalItem,cAdicionarNovo,cAssociarExistente}, itensAjustes:
//   {cCFOPEntrada (CFOP de entrada que o Omie usara - pode virar normal!),
//   codigo_local_estoque,nQtdeRecebida}, ...impostos}], totais, parcelas, ... }] }
// IMPORTANTE: o "sinal de garantia" (cCFOP do fornecedor, cNaturezaOperacao) so
// existe enquanto o recebimento esta pendente; ao ser processado vira cCFOPEntrada.
// =============================================================================
export function normalizarRecebimento(rec: any): any {
  if (!rec || typeof rec !== 'object') return null;
  const cab = rec.cabec || rec.cabecalho || {};
  const ic = rec.infoCadastro || rec.cadastro || {};
  const itensArr = Array.isArray(rec.itensRecebimento) ? rec.itensRecebimento : (Array.isArray(rec.itens) ? rec.itens : []);
  const itens: any[] = [];
  for (const it of itensArr) {
    const ca = it.itensCabec || it.cabec || {};
    const aj = it.itensAjustes || {};
    const idProduto = num(ca.nIdProduto ?? it.nIdProduto);
    const qtde = num(ca.nQtdeNFe ?? aj.nQtdeRecebida ?? it.nQtde);
    const precoUnit = num(ca.nPrecoUnit ?? it.nPrecoUnit);
    const valTotalItem = num(ca.vTotalItem ?? it.vTotalItem ?? (qtde * precoUnit));
    itens.push({
      nSequencia: ca.nSequencia ?? it.nSequencia ?? null,
      cfop: ca.cCFOP ?? it.cCFOP ?? null,                       // CFOP do fornecedor (sinal de garantia)
      cfopEntrada: aj.cCFOPEntrada ?? null,                      // CFOP de entrada que o Omie puxaria (pode estar errado / vazio)
      cfopEntradaSugerido: cfopEntradaEquivalente(ca.cCFOP ?? it.cCFOP),  // equivalente do CFOP de saida (5->1, 6->2)
      codigoProdutoInt: ca.cCodigoProduto ?? null,
      descricaoProduto: ca.cDescricaoProduto ?? null,
      ncm: ca.cNCM ?? null,
      idProduto: idProduto > 0 ? idProduto : null,
      criarNovo: ca.cAdicionarNovo === 'S',
      associarExistente: ca.cAssociarExistente === 'S',
      qtde, precoUnit, valTotalItem,
      localEstoque: aj.codigo_local_estoque ?? null,
      naoGerarMovEstoque: aj.cNaoGerarMovEstoque === 'S',
      naoGerarFinanceiro: aj.cNaoGerarFinanceiro === 'S'
    });
  }
  return {
    idReceb: cab.nIdReceb ?? rec.nIdReceb ?? null,
    numeroNFe: cab.cNumeroNFe != null ? String(cab.cNumeroNFe) : null,
    serieNFe: cab.cSerieNFe != null ? String(cab.cSerieNFe) : null,
    chaveNFe: cab.cChaveNFe ?? null,
    etapa: cab.cEtapa ?? null,
    naturezaOperacao: cab.cNaturezaOperacao ?? null,
    fornecedorNome: cab.cRazaoSocial ?? cab.cNome ?? null,
    fornecedorCnpjCpf: cab.cCNPJ_CPF ?? null,
    idFornecedor: cab.nIdFornecedor ?? null,
    dataEmissao: cab.dEmissaoNFe ?? null,
    valorNFe: num(cab.nValorNFe),
    recebido: ic.cRecebido === 'S',
    faturado: ic.cFaturado === 'S',
    cancelada: ic.cCancelada === 'S',
    bloqueado: ic.cBloqueado === 'S',
    itens,
    raw: rec
  };
}

// Lista recebimentos de NF-e da conta entre duas datas de emissao (DD/MM/YYYY),
// com detalhes (itens). Retorna array normalizado.
export async function listarRecebimentos(conta: Conta, dataEmissaoDeBR: string, dataEmissaoAteBR: string, opts: Record<string, any> = {}): Promise<any[]> {
  const { itens } = await paginarOmie('/produtos/recebimentonfe/', 'ListarRecebimentos', {
    dtEmissaoDe: dataEmissaoDeBR,
    dtEmissaoAte: dataEmissaoAteBR,
    cExibirDetalhes: 'S',
    cOrdenarPor: 'CODIGO'
  }, conta, {
    paginaKey: 'nPagina', regKey: 'nRegistrosPorPagina', regValue: 50,
    totalKeys: ['nTotalPaginas', 'nTotPaginas', 'total_de_paginas'],
    listaKeys: ['recebimentos', 'recebimento', 'lista', 'cadastros'],
    debugTag: 'ListarRecebimentos',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`ListarRecebimentos pag ${pag}/${tot || '?'}: ${lista.length} recebimentos`);
    }
  });
  return itens.map(normalizarRecebimento).filter(Boolean);
}

// CFOP de entrada equivalente ao CFOP de saida da NF (do fornecedor):
// troca o 1o digito 5->1, 6->2, 7->3 e mantem os 3 ultimos. Ex.: "6.949" -> "2.949".
// (Corrige o comportamento do Omie de "puxar" o CFOP de entrada da ultima entrada do produto.)
export function cfopEntradaEquivalente(cfopSaida: any): string | null {
  if (cfopSaida == null) return null;
  const d = String(cfopSaida).replace(/\D/g, '');
  if (d.length < 4) return null;
  const mapa: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  const primeiro = mapa[d[0]] || d[0];
  const resto = d.slice(1, 4);
  return `${primeiro}.${resto}`;
}

// AlterarRecebimento - edita itens de um recebimento ANTES de concluir.
// itens: [{ nSequencia, cAcao ('EDITAR'|'NOVO'|...), cCFOPEntrada, cNaoGerarFinanceiro ('S'/'N'), cNaoGerarMovEstoque ('S'/'N') }].
// Monta itensRecebimentoEditar[] com itensIde + itensAjustes. ATENCAO: estrutura
// do AlterarRecebimento da Omie e' complexa - testar em runtime; se reclamar de
// campos faltando, ajustar (pode precisar reenviar mais campos de cada item).
export async function alterarRecebimentoItens(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const { idReceb, chaveNFe, itens } = args;
  if (idReceb == null && chaveNFe == null) throw new Error('informe idReceb ou chaveNFe');
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('informe itens a editar');
  const ide: Record<string, any> = {};
  // Omie aceita APENAS um identificador (nIdReceb OU cChaveNfe), nunca os dois.
  if (idReceb != null) ide.nIdReceb = Number(idReceb) || idReceb;
  else if (chaveNFe) ide.cChaveNfe = String(chaveNFe);
  const itensRecebimentoEditar = itens.map((it: any) => {
    // O Omie so documenta 2 acoes: EDITAR e IGNORAR. O antigo 'NOVO' (item cujo produto
    // nao existe no cadastro) NAO e' acao valida: o recebimento pendente ja traz
    // cAdicionarNovo='S', entao editamos a linha (EDITAR) para informar o CFOP e o Omie
    // cria o produto ao concluir. Sem EDITAR+cCFOPEntrada o Omie recusa concluir
    // (ERROR: "O item N esta sem o CFOP para o Recebimento"). Testado em runtime NF 55693.
    const cAcao = String(it.cAcao || 'EDITAR') === 'IGNORAR' ? 'IGNORAR' : 'EDITAR';
    const itensIde = { nSequencia: Number(it.nSequencia) || it.nSequencia, cAcao };
    // IGNORAR (unica acao != EDITAR) nao aceita itensAjustes/itensCustoEstoque
    // (ERROR: Quando a tag [cAcao] e' diferente de 'EDITAR' as tag [...] nao devem ser
    // informadas). Nesse caso mandamos SO o itensIde.
    if (cAcao !== 'EDITAR') return { itensIde };

    const ajustes: Record<string, any> = {};
    if (it.cCFOPEntrada) ajustes.cCFOPEntrada = String(it.cCFOPEntrada);
    if (it.cNaoGerarFinanceiro != null) ajustes.cNaoGerarFinanceiro = it.cNaoGerarFinanceiro === 'S' || it.cNaoGerarFinanceiro === true ? 'S' : 'N';
    if (it.cNaoGerarMovEstoque != null) ajustes.cNaoGerarMovEstoque = it.cNaoGerarMovEstoque === 'S' || it.cNaoGerarMovEstoque === true ? 'S' : 'N';
    // OBS: categoria/departamento NAO fazem parte de itensAjustes no Omie
    // (ERROR: Tag [CCODCATEGORIA]/[CCODDEPARTAMENTO] nao faz parte da estrutura do
    // tipo complexo [itensAjustes] - testado em runtime, NF 55693). Removidas.
    // Se um dia formos setar categoria no recebimento (Fase 3), e' em outro bloco.
    const bloco: Record<string, any> = {
      itensIde,
      itensAjustes: ajustes
    };
    // flags da aba "Custo de Estoque" do recebimento (Omie web tem 8 checkboxes
    // que definem quais valores entram no custo do produto - afeta CMC).
    // Sub-objeto opcional - se o caller passar `custoEstoque`, aplicamos.
    if (it.custoEstoque && typeof it.custoEstoque === 'object') {
      const c = it.custoEstoque;
      const toSN = (v: any) => v === 'S' || v === true || v === 1 ? 'S' : 'N';
      bloco.itensCustoEstoque = {
        cIcmsCusto:       toSN(c.cIcmsCusto),
        cIcmsStCusto:     toSN(c.cIcmsStCusto),
        cIpiCusto:        toSN(c.cIpiCusto),
        cPisCusto:        toSN(c.cPisCusto),
        cCofinsCusto:     toSN(c.cCofinsCusto),
        cFreteCusto:      toSN(c.cFreteCusto),
        cSeguroCusto:     toSN(c.cSeguroCusto)
        // OBS: o Omie NAO aceita a tag cOutrasDespCusto em itensCustoEstoque
        // (ERROR: Tag [COUTRASDESPCUSTO] nao faz parte da estrutura). Removida.
      };
    }
    return bloco;
  });
  return omieRequest('/produtos/recebimentonfe/', 'AlterarRecebimento', { ide, itensRecebimentoEditar }, conta);
}

// Conclui ("da entrada" em) um recebimento de NF-e -> vira nota de entrada,
// gera movimento de estoque e contas a pagar (igual processar no Omie).
// ConcluirRecebimento { nIdReceb, cChaveNfe, cEtapa } - cEtapa = etapa final
// ("Concluido"); nas contas NOVA/CASTRO observamos "60". Configuravel via
// process.env.RECEBIMENTO_ETAPA_CONCLUIDO. Se a Omie reclamar de etapa/CFOP, o
// erro indica o que falta (pode precisar de AlterarEtapaRecebimento/AlterarRecebimento antes).
export async function concluirRecebimento(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const { idReceb, chaveNFe, etapa } = args;
  if (idReceb == null && chaveNFe == null) throw new Error('informe idReceb ou chaveNFe');
  const cEtapa = String(etapa || process.env.RECEBIMENTO_ETAPA_CONCLUIDO || '60');
  const params: Record<string, any> = { cEtapa };
  // Omie aceita APENAS um identificador (nIdReceb OU cChaveNfe), nunca os dois.
  if (idReceb != null) params.nIdReceb = Number(idReceb) || idReceb;
  else if (chaveNFe) params.cChaveNfe = String(chaveNFe);
  const data = await omieRequest('/produtos/recebimentonfe/', 'ConcluirRecebimento', params, conta);
  return { ok: true, idReceb: data && (data.nIdReceb ?? idReceb), codStatus: data && (data.cCodStatus ?? data.codigo_status), descStatus: data && (data.cDescStatus ?? data.descricao_status), rawRequest: params, rawResponse: data };
}

export async function alterarEtapaRecebimento(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const { idReceb, chaveNFe, etapa } = args;
  const params: Record<string, any> = { cEtapa: String(etapa) };
  if (idReceb != null) params.nIdReceb = Number(idReceb) || idReceb;
  else if (chaveNFe) params.cChaveNfe = String(chaveNFe);
  return omieRequest('/produtos/recebimentonfe/', 'AlterarEtapaRecebimento', params, conta);
}

export async function reverterRecebimento(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const { idReceb, chaveNFe, etapa } = args;
  const params: Record<string, any> = { cEtapa: String(etapa || '40') };
  if (idReceb != null) params.nIdReceb = Number(idReceb) || idReceb;
  else if (chaveNFe) params.cChaveNfe = String(chaveNFe);
  return omieRequest('/produtos/recebimentonfe/', 'ReverterRecebimento', params, conta);
}

// =============================================================================
// Movimentos de estoque de um produto (para reconstruir o CMC).
// /estoque/consulta/ -> MovimentoEstoque { id_prod, dataInicial, dataFinal }.
// Cada movimento traz "movPeriodo": array com 4 entradas (tipo "1.Anterior",
// "2.Entrada", "3.Saída", "4.Atual"), cada uma com { cmcUnitario, cmcTotal, qtde }.
// Ou seja: o CMC vigente ANTES (1.Anterior) e DEPOIS (4.Atual) de cada movimento
// esta disponivel. Isso permite restaurar "o CMC de antes da NF de garantia".
// Retorna [{ data, codOrigem, desOrigem, numDoc, numPedido, cancelado, devolucao,
//   idDoc, idRecebimento, idAjuste, operacao, qtdeEntrada, entradaCMC, qtdeSaida,
//   cmcAnterior, qtdeAnterior, cmcAtual, qtdeAtual, raw }] ordenado por data asc.
// =============================================================================
function parseDataMovParaOrdenacao(s: any): number {
  if (!s) return 0;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
}

function parseMovPeriodo(arr: any): any {
  const out: any = { cmcAnterior: null, qtdeAnterior: null, entradaCMC: null, qtdeEntrada: 0, saidaCMC: null, qtdeSaida: 0, cmcAtual: null, qtdeAtual: null };
  if (!Array.isArray(arr)) return out;
  for (const e of arr) {
    const t = String(e && e.tipo || '').toLowerCase();
    const cmcU = num(e && e.cmcUnitario);
    const q = num(e && e.qtde);
    if (t.indexOf('anterior') >= 0) { out.cmcAnterior = cmcU; out.qtdeAnterior = q; }
    else if (t.indexOf('entrada') >= 0) { out.entradaCMC = cmcU; out.qtdeEntrada = q; }
    else if (t.indexOf('sa') >= 0 && (t.indexOf('da') >= 0 || t.indexOf('ída') >= 0 || t.indexOf('ida') >= 0)) { out.saidaCMC = cmcU; out.qtdeSaida = q; }
    else if (t.indexOf('atual') >= 0) { out.cmcAtual = cmcU; out.qtdeAtual = q; }
  }
  return out;
}

export async function obterMovimentosProduto(conta: Conta, idProd: any, dataDeBR: string, dataAteBR: string): Promise<any[]> {
  let resp: any;
  try {
    resp = await omieRequest('/estoque/consulta/', 'MovimentoEstoque', {
      id_prod: Number(idProd) || idProd,
      dataInicial: dataDeBR,
      dataFinal: dataAteBR
    }, conta);
  } catch (e) {
    if (ehErroSemRegistros(e)) return [];
    throw e;
  }
  const lista = (resp && (resp.movProduto || resp.movimentos || resp.movEstoque || resp.lista)) || [];
  const movs = lista.map((m: any) => {
    const mp = parseMovPeriodo(m && m.movPeriodo);
    return {
      data: (m && (m.dtMov || m.data || m.dDtMov)) || null,
      codOrigem: String((m && (m.codOrigem || m.cCodOrigem)) || '').toUpperCase(),
      desOrigem: (m && (m.desOrigem || m.cDesOrigem || m.descricao)) || null,
      numDoc: (m && (m.numDoc || m.cNumDoc || m.docFiscal)) || null,
      numPedido: (m && (m.numPedido || m.cNumPedido)) || null,
      cancelado: (m && m.cancelamento === 'S') || false,
      devolucao: (m && m.devolucao === 'S') || false,
      idDoc: (m && (m.idDoc || m.nIdDoc)) || null,
      idRecebimento: (m && m.idRecebimento) || null,
      idAjuste: num(m && m.idAjuste),
      operacao: (m && m.operacao) || null,
      qtdeEntrada: mp.qtdeEntrada,
      entradaCMC: mp.entradaCMC,
      qtdeSaida: mp.qtdeSaida,
      cmcAnterior: (mp.cmcAnterior != null && mp.cmcAnterior > 0) ? mp.cmcAnterior : null,
      qtdeAnterior: mp.qtdeAnterior,
      cmcAtual: (mp.cmcAtual != null && mp.cmcAtual > 0) ? mp.cmcAtual : null,
      qtdeAtual: mp.qtdeAtual,
      raw: m
    };
  });
  // ordena por data; para mesma data, mantem a ordem original (sort estavel no V8)
  movs.sort((a: any, b: any) => parseDataMovParaOrdenacao(a.data) - parseDataMovParaOrdenacao(b.data));
  return movs;
}

// =============================================================================
// Produtos (resolver descricao / id_prod a partir de codigo de integracao)
// =============================================================================
export async function consultarProduto(conta: Conta, codigoProduto: any): Promise<any> {
  const data = await omieRequest('/geral/produtos/', 'ConsultarProduto', {
    codigo_produto: Number(codigoProduto) || codigoProduto
  }, conta);
  return normalizarProduto(data);
}

export async function consultarProdutoPorIntegracao(conta: Conta, codInt: any): Promise<any> {
  const data = await omieRequest('/geral/produtos/', 'ConsultarProduto', {
    codigo_produto_integracao: String(codInt)
  }, conta);
  return normalizarProduto(data);
}

function normalizarProduto(p: any): any {
  if (!p || typeof p !== 'object') return null;
  return {
    codigoProduto: p.codigo_produto ?? p.nCodProd ?? null,
    codigoIntegracao: p.codigo_produto_integracao ?? p.cCodIntProd ?? null,
    descricao: p.descricao ?? p.cDescricao ?? null,
    unidade: p.unidade ?? p.cUnidade ?? null,
    raw: p
  };
}

// Normaliza um item de ListarProdutos (produto_servico_cadastro), extraindo as
// "caracteristicas" (atributos chave-valor da Omie). Defensivo p/ variacoes de
// chave (cNomeCaract/cConteudo sao os documentados; tenta alternativas).
export function normalizarProdutoLista(p: any): any {
  if (!p || typeof p !== 'object') return null;
  const codigoProduto = p.codigo_produto ?? p.nCodProd ?? null;
  if (codigoProduto == null) return null;
  const arr = Array.isArray(p.caracteristicas) ? p.caracteristicas
    : (Array.isArray(p.caracteristica) ? p.caracteristica : []);
  const caracteristicas = arr.map((c: any) => {
    const conteudo = c.cConteudo ?? c.conteudo ?? c.cValor ?? c.valor ?? null;
    return {
      nome: c.cNomeCaract ?? c.nomeCaracteristica ?? c.cNome ?? c.nome ?? null,
      // a API escapa HTML na saída (12" vira 12&quot;) — armazena decodificado
      conteudo: typeof conteudo === 'string' ? decodeOmieTexto(conteudo) : conteudo
    };
  }).filter((c: any) => c.nome != null && String(c.nome).trim() !== '');
  const descricao = p.descricao ?? p.cDescricao ?? null;
  return {
    codigoProduto,
    codigo: p.codigo ?? p.cCodigo ?? null,            // SKU
    descricao: descricao != null ? decodeOmieTexto(descricao) : null,
    familia: p.descricao_familia ?? p.descricaoFamilia ?? p.cDescricaoFamilia ?? null,
    inativo: String(p.inativo ?? p.cInativo ?? '').toUpperCase() === 'S',
    caracteristicas
  };
}

// Lista TODOS os produtos da conta (paginado) com suas caracteristicas embutidas.
// /geral/produtos/ -> ListarProdutos.
//  - filtrar_apenas_omiepdv:'N' e' obrigatorio (sem ele a Omie devolve 0 registros).
//  - exibir_caracteristicas:'S' e' o que faz a Omie embutir o array `caracteristicas`
//    no retorno (sem essa flag a chave nem aparece - validado em runtime 08/06/2026).
// Retorna array normalizado (normalizarProdutoLista).
export async function listarProdutos(conta: Conta, opts: Record<string, any> = {}): Promise<any[]> {
  const { itens } = await paginarOmie('/geral/produtos/', 'ListarProdutos', {
    filtrar_apenas_omiepdv: 'N',
    exibir_caracteristicas: 'S'
  }, conta, {
    paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 100,
    totalKeys: ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas'],
    listaKeys: ['produto_servico_cadastro', 'produtos_cadastro', 'produtoServico', 'cadastros'],
    debugTag: 'ListarProdutos',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`ListarProdutos pag ${pag}/${tot || '?'}: ${lista.length} produtos`);
    }
  });
  return itens.map(normalizarProdutoLista).filter(Boolean);
}

// Mapa codigo_produto -> descricao_familia (ListarProdutos paginado, sem o payload
// de caracteristicas). Usado pelo inventario p/ filtrar so familia "Pecas" + #N/D.
export async function mapaFamiliaProduto(conta: Conta, opts: Record<string, any> = {}): Promise<Map<any, string>> {
  const { itens } = await paginarOmie('/geral/produtos/', 'ListarProdutos', {
    filtrar_apenas_omiepdv: 'N'
  }, conta, {
    paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 100,
    totalKeys: ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas'],
    listaKeys: ['produto_servico_cadastro', 'produtos_cadastro', 'produtoServico', 'cadastros'],
    debugTag: 'ListarProdutos(familia)',
    onPagina: (lista, pag, tot) => {
      if (opts.onProgress) opts.onProgress(`familias: pag ${pag}/${tot || '?'} (${lista.length} produtos)`);
    }
  });
  const map = new Map<any, string>();
  for (const p of itens) {
    const id = p.codigo_produto;
    if (id == null) continue;
    map.set(Number(id) || id, String(p.descricao_familia || '').trim());
  }
  return map;
}

// =============================================================================
// Caracteristicas (cadastro): /geral/caracteristicas/ -> ListarCaracteristicas.
// Devolve o catalogo de caracteristicas da conta com o codigo INTERNO (nCodCaract)
// e a lista de valores permitidos (conteudosPermitidos). Necessario porque a
// gravacao em produto (/geral/prodcaract/) exige nCodCaract, nao o nome.
// Resultado cacheado em memoria por conta (catalogo muda raramente).
// =============================================================================
const _caractCatalogoCache: Record<string, any> = {};

export async function listarCaracteristicas(conta: Conta, opts: Record<string, any> = {}): Promise<any[]> {
  if (!opts.forcar && _caractCatalogoCache[conta]) return _caractCatalogoCache[conta];
  const { itens } = await paginarOmie('/geral/caracteristicas/', 'ListarCaracteristicas', {}, conta, {
    paginaKey: 'nPagina', regKey: 'nRegPorPagina', regValue: 100,
    totalKeys: ['nTotPaginas'],
    listaKeys: ['listaCaracteristicas', 'caracteristicasCadastro'],
    debugTag: 'ListarCaracteristicas'
  });
  const cat = itens.map((c: any) => ({
    nCodCaract: c.nCodCaract ?? c.codigo ?? null,
    cCodIntCaract: c.cCodIntCaract ?? null,
    nome: c.cNomeCaract ?? c.nomeCaracteristica ?? c.cNome ?? null,
    conteudosPermitidos: (Array.isArray(c.conteudosPermitidos) ? c.conteudosPermitidos : [])
      .map((x: any) => (x && (x.cConteudo ?? x.conteudo)) != null ? String(x.cConteudo ?? x.conteudo) : null)
      .filter((v: any) => v != null && v.trim() !== '')
  })).filter((c: any) => c.nome != null && c.nCodCaract != null);
  _caractCatalogoCache[conta] = cat;
  return cat;
}

// Resolve o nCodCaract a partir do nome (trim + case-insensitive).
async function codigoCaractPorNome(conta: Conta, nome: any): Promise<any> {
  const alvo = String(nome || '').trim().toLowerCase();
  const cat = await listarCaracteristicas(conta);
  const hit = cat.find((c: any) => String(c.nome).trim().toLowerCase() === alvo);
  return hit ? hit.nCodCaract : null;
}

// Grava (associa/atualiza) o conteudo de uma caracteristica num produto.
// /geral/prodcaract/ -> AlterarCaractProduto (ja associada) com fallback p/
// IncluirCaractProduto (ainda nao associada), e vice-versa. Exige nCodProd +
// nCodCaract + cConteudo.
export async function gravarCaractProduto(conta: Conta, { codigoProduto, nomeCaract, conteudo, preferirIncluir }: { codigoProduto: any; nomeCaract: any; conteudo: any; preferirIncluir?: boolean }): Promise<any> {
  const nCodCaract = await codigoCaractPorNome(conta, nomeCaract);
  if (nCodCaract == null) throw new Error(`Caracteristica nao encontrada na Omie: "${nomeCaract}"`);
  const params = {
    nCodProd: Number(codigoProduto) || codigoProduto,
    nCodCaract: Number(nCodCaract) || nCodCaract,
    cConteudo: conteudo == null ? '' : String(conteudo)
  };
  const alterar = () => omieRequest('/geral/prodcaract/', 'AlterarCaractProduto', params, conta);
  const incluir = () => omieRequest('/geral/prodcaract/', 'IncluirCaractProduto', params, conta);
  const jaExiste = (e: OmieError) => /j[aá]\s+(cadastrad|associad|exist)/i.test(String(e.faultstring || e.message || ''));
  // preferirIncluir: quando o campo esta vazio a caracteristica quase nunca esta
  // associada ao produto — Incluir primeiro evita a chamada dupla (Alterar falha
  // + Incluir), que dobrava o consumo e derrubava lotes no bloqueio da Omie.
  if (preferirIncluir) {
    try {
      return await incluir();
    } catch (eInc) {
      if ((eInc as OmieError).bloqueio) throw eInc;
      try {
        return await alterar();
      } catch (eAlt) {
        if ((eAlt as OmieError).bloqueio) throw eAlt;
        if (jaExiste(eInc as OmieError)) throw eAlt;
        throw eInc;
      }
    }
  }
  // Tenta Alterar (caracteristica ja associada ao produto). Se a Omie recusar
  // porque ainda nao esta associada (ex.: "Caracteristica do Produto nao
  // cadastrada."), cai pra Incluir. Se o Incluir falhar por ja existir, o erro
  // real e' do Alterar.
  try {
    return await alterar();
  } catch (eAlt) {
    if ((eAlt as OmieError).bloqueio) throw eAlt;  // bloqueio longo: nao adianta tentar Incluir
    try {
      return await incluir();
    } catch (eInc) {
      if (jaExiste(eInc as OmieError)) throw eAlt;
      throw eInc;
    }
  }
}

// =============================================================================
// Ajuste de estoque (wrapper geral) - /estoque/ajuste/ -> IncluirAjusteEstoque.
// tipo: 'SLD' (ajusta o saldo do dia para `quan`, ao custo unitario `valor`),
//   'ENT'/'SAI'/'TRF'. motivo: 'CMC' ("Ajuste do Valor do CMC" - p/ corrigir so
//   o CMC sem mexer no saldo, use quan = saldo atual), 'INV' (ajuste de inventario),
//   'OPE'/'PER'/... `data` pode ser RETROATIVA - o Omie reprocessa os movimentos
//   posteriores. Resposta observada: { id_ajuste, id_movest, codigo_status:"0", descricao_status }.
// =============================================================================
export async function incluirAjusteEstoque(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const {
    idProd, codProduto, codInt, codLocal,
    dataBR, tipo = 'SLD', quan, valor, motivo = 'CMC', origem = 'AJU', obs
  } = args;
  const q = Number(quan);
  if (!Number.isFinite(q)) throw new Error('quan invalido para ajuste de estoque');
  // SLD precisa de valor>0 (= novo CMC); SAI/ENT aceitam sem valor (Omie usa o CMC vigente)
  if (String(tipo) === 'SLD' && !(Number(valor) > 0)) throw new Error('valor (custo unitario) deve ser > 0 para tipo SLD');
  if (codLocal == null) throw new Error('informe o codigo do local de estoque');
  const params: Record<string, any> = {
    codigo_local_estoque: codLocal,
    id_prod: Number(idProd ?? codProduto) || (idProd ?? codProduto),
    data: dataBR || fmtBR(hoje()),
    tipo: String(tipo || 'SLD'),
    quan: q,
    obs: (obs && String(obs).trim()) || 'Ajuste de estoque (app ajustes-omie)',
    origem: String(origem || 'AJU'),
    motivo: String(motivo || 'CMC')
  };
  if (valor != null && Number.isFinite(Number(valor))) params.valor = Number(valor);
  if (codInt) params.cod_int = String(codInt);
  const data = await omieRequest('/estoque/ajuste/', 'IncluirAjusteEstoque', params, conta);
  const codigoAjuste = data && (
    data.id_ajuste ?? data.nCodAjuste ?? data.codigo_ajuste_estoque ?? data.nIdAjuste ?? data.codigo_ajuste ?? null
  );
  const idMovest = data && (data.id_movest ?? data.nCodMov ?? data.id_movimento ?? data.id_mov_est ?? null);
  return { codigoAjuste, idMovest, rawRequest: params, rawResponse: data };
}

// Ajuste de CMC "remendo" (data de hoje, saldo inalterado): SLD com quan = QTDE
// FISICA atual do produto naquele local + valor = novo CMC + motivo='CMC'. Usado
// pelo Dashboard de garantia. quan deve ser != 0 (mandar o saldo "disponivel" no
// lugar do fisico e' incorreto; quan pode ser negativo - estoque negativo).
export async function incluirAjusteCMC(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const {
    idProd, codProduto, codInt, codLocal,
    qtdFisicoAtual, qtdSaldoAtual, // qtdSaldoAtual = alias legado; use qtdFisicoAtual
    novoCMC, obs, dataBR
  } = args;
  const quan = Number(qtdFisicoAtual != null ? qtdFisicoAtual : qtdSaldoAtual);
  if (!Number.isFinite(quan) || quan === 0) {
    throw new Error('quantidade fisica atual nao pode ser 0/invalida para ajuste de CMC via SLD');
  }
  return incluirAjusteEstoque(conta, {
    idProd, codProduto, codInt, codLocal, dataBR,
    tipo: 'SLD', quan, valor: novoCMC, motivo: 'CMC', origem: 'AJU',
    obs: (obs && String(obs).trim()) || 'Correcao de CMC - entrada de garantia distorceu o custo (app)'
  });
}

export async function listarAjustesEstoque(conta: Conta, params: Record<string, any> = {}): Promise<any> {
  return omieRequest('/estoque/ajuste/', 'ListarAjusteEstoque', params, conta);
}
// Exclui um ajuste de estoque (reverte o movimento). O ExcluirAjusteEstoque
// aceita SOMENTE a tag `id_ajuste` (complexo estoque_mov_ajuste_cadastro_id_ajuste);
// mandar qualquer outra tag (ex.: nCodAjuste) faz o Omie recusar com
// "Tag [...] nao faz parte da estrutura do tipo complexo".
export async function excluirAjusteEstoque(conta: Conta, codigoAjuste: any): Promise<any> {
  return omieRequest('/estoque/ajuste/', 'ExcluirAjusteEstoque', {
    id_ajuste: Number(codigoAjuste) || codigoAjuste
  }, conta);
}

// ============================================================================
// Pedidos de venda (`/produtos/pedido/`)
// ============================================================================
// Lista pedidos de venda. Filtros principais: data de previsao de fat (`dDtPrevisao`),
// status do pedido, etapa, cliente. Retorna `pedido_venda_produto: [...]`.
export async function listarPedidos(conta: Conta, dataDeBR: string, dataAteBR: string, opts: Record<string, any> = {}): Promise<any[]> {
  const base: Record<string, any> = {
    pagina: 1,
    registros_por_pagina: 50,
    apenas_importado_api: 'N'
  };
  if (dataDeBR) base.filtrar_por_data_de = dataDeBR;
  if (dataAteBR) base.filtrar_por_data_ate = dataAteBR;
  if (opts.etapa) base.filtrar_por_etapa = String(opts.etapa);
  if (opts.cliente) base.filtrar_por_cliente = Number(opts.cliente);
  if (opts.statusPedido) base.status_pedido = String(opts.statusPedido); // ATIVO|CANCELADO|FATURADO|...
  const { itens } = await paginarOmie('/produtos/pedido/', 'ListarPedidos', base, conta, {
    listaKeys: ['pedido_venda_produto'],
    totalKeys: ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas']
  });
  return itens;
}

export async function consultarPedido(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const params: Record<string, any> = {};
  if (args.idPedido != null) params.codigo_pedido = Number(args.idPedido) || args.idPedido;
  if (args.numeroPedido) params.numero_pedido = String(args.numeroPedido);
  if (args.codIntegracao) params.codigo_pedido_integracao = String(args.codIntegracao);
  if (!params.codigo_pedido && !params.numero_pedido && !params.codigo_pedido_integracao) {
    throw new Error('informe idPedido, numeroPedido ou codIntegracao');
  }
  return omieRequest('/produtos/pedido/', 'ConsultarPedido', params, conta);
}

// Acrescenta texto na observacao do pedido (mantem a obs anterior).
// AlterarPedidoVenda aceita atualizacao parcial enviando so cabecalho.codigo_pedido + os campos novos.
export async function alterarObservacaoPedido(conta: Conta, { idPedido, observacoes, observacoes_internas, append = true }: { idPedido: any; observacoes?: any; observacoes_internas?: any; append?: boolean }): Promise<any> {
  if (idPedido == null) throw new Error('informe idPedido');
  let novaObs = observacoes != null ? String(observacoes) : null;
  let novaObsInt = observacoes_internas != null ? String(observacoes_internas) : null;
  if (append && (novaObs || novaObsInt)) {
    try {
      const atual = await consultarPedido(conta, { idPedido });
      const obsAtual = atual && atual.observacoes && atual.observacoes.obs_venda;
      const obsIntAtual = atual && atual.observacoes && atual.observacoes.obs_internas;
      if (novaObs && obsAtual && obsAtual.trim()) novaObs = obsAtual.trim() + '\n' + novaObs;
      if (novaObsInt && obsIntAtual && obsIntAtual.trim()) novaObsInt = obsIntAtual.trim() + '\n' + novaObsInt;
    } catch (e) { /* segue sem o append */ }
  }
  const body: Record<string, any> = { cabecalho: { codigo_pedido: Number(idPedido) || idPedido }, observacoes: {} };
  if (novaObs != null) body.observacoes.obs_venda = novaObs;
  if (novaObsInt != null) body.observacoes.obs_internas = novaObsInt;
  return omieRequest('/produtos/pedido/', 'AlterarPedidoVenda', body, conta);
}

// Lista clientes (resumido) - retorna codigo + nome para lookup. Paginado.
export async function listarClientesResumido(conta: Conta, opts: Record<string, any> = {}): Promise<any[]> {
  const { itens } = await paginarOmie('/geral/clientes/', 'ListarClientesResumido', { apenas_importado_api: 'N' }, conta, {
    listaKeys: ['clientes_cadastro_resumido', 'clientes_cadastro'],
    totalKeys: ['total_de_paginas', 'nTotPaginas']
  });
  return itens;
}

// Lista usuarios do sistema (pra resolver login Omie -> nome). Usado pra
// exibir "Criado por" no pedido (cabec.infoCadastro.uInc).
export async function listarUsuarios(conta: Conta): Promise<any[]> {
  // Tenta variantes da call (Omie nao documenta de forma consistente)
  for (const candidato of [
    { ep: '/geral/usuarios/', call: 'ListarUsuariosResumido' },
    { ep: '/geral/usuarios/', call: 'ListarUsuarios' }
  ]) {
    try {
      const r = await omieRequest(candidato.ep, candidato.call, { pagina: 1, registros_por_pagina: 500 }, conta);
      const lista = r.usuario_resumido_cadastro || r.usuarios_cadastro || r.cadastros || r.usuarios || [];
      if (Array.isArray(lista)) return lista;
    } catch (e) { /* tenta proxima */ }
  }
  return [];
}

// Lista etapas configuradas do pedido (cEtapa -> descricao). Cada conta tem suas.
export async function listarEtapasPedido(conta: Conta): Promise<any[]> {
  // chama uma vez por conta - sem paginacao real (sao poucas etapas)
  try {
    const r = await omieRequest('/produtos/etapafaturamento/', 'ListarEtapaFat', { nPagina: 1, nRegPorPagina: 500 }, conta);
    return r.cadastros || r.etapas || r.etapafat_cadastro || [];
  } catch (e) {
    // Fallback: tenta variante alternativa
    try {
      const r = await omieRequest('/produtos/etapaspedido/', 'ListarEtapaPedido', { pagina: 1, registros_por_pagina: 500 }, conta);
      return r.etapa_pedido_cadastro || r.cadastros || [];
    } catch (_) {
      return [];
    }
  }
}

// Cancela/exclui um pedido de venda. A call correta no Omie e' "ExcluirPedido"
// (CancelarPedido/CancelarPedidoVenda nao existem - retornam Method not exists).
export async function cancelarPedido(conta: Conta, { idPedido, numeroPedido }: { idPedido?: any; numeroPedido?: any }): Promise<any> {
  const params: Record<string, any> = {};
  if (idPedido != null) { params.codigo_pedido = Number(idPedido) || idPedido; }
  if (numeroPedido) { params.numero_pedido = String(numeroPedido); }
  if (!params.codigo_pedido && !params.numero_pedido) throw new Error('informe idPedido ou numeroPedido');
  return omieRequest('/produtos/pedido/', 'ExcluirPedido', params, conta);
}

// Normaliza um pedido de venda do retorno do Omie (ListarPedidos / ConsultarPedido)
export function normalizarPedido(p: any): any {
  if (!p || typeof p !== 'object') return null;
  // ConsultarPedido envelopa em {pedido_venda_produto: {...}}; ListarPedidos ja entrega desempacotado
  if (p.pedido_venda_produto) p = p.pedido_venda_produto;
  const cab = p.cabecalho || {};
  const info = p.infoCadastro || {};
  const dInc = info.dInc || cab.dInc || null;   // data inclusao (DD/MM/YYYY)
  const dAlt = info.dAlt || cab.dAlt || null;   // data ultima alteracao
  const uInc = info.uInc || cab.uInc || null;   // login do usuario que criou no Omie
  const uAlt = info.uAlt || cab.uAlt || null;   // login do usuario da ultima alteracao
  const total = p.total_pedido || p.totalPedido || {};
  const det = Array.isArray(p.det) ? p.det : (Array.isArray(p.produtos) ? p.produtos : []);
  const obs = p.observacoes || {};
  const itens = det.map((d: any, i: number) => {
    const prod = d.produto || d;
    const inf = d.inf_adic || {};
    return {
      idItem: prod.codigo_item ?? prod.nCodIt ?? null,
      nSequencia: d.ide && d.ide.codigo_item_integracao ? d.ide.codigo_item_integracao : (i + 1),
      idProduto: prod.codigo_produto ?? prod.nCodProd ?? null,
      // SKU primeiro (codigo do cadastro / cCodigo); cod de integracao so como fallback
      codigo: prod.codigo || prod.cCodigo || prod.codigo_produto_integracao || null,
      codigoIntegracao: prod.codigo_produto_integracao || null,
      descricao: prod.descricao_produto || prod.descricao || prod.cDescricao || null,
      cfop: prod.cfop || null,
      qtde: Number(prod.quantidade || prod.nQtde || 0),
      valorUnit: Number(prod.valor_unitario || prod.nValUnit || 0),
      valorTotal: Number(prod.valor_total || (Number(prod.quantidade || 0) * Number(prod.valor_unitario || 0))),
      codLocalEstoque: inf.codigo_local_estoque ?? prod.codigo_local_estoque ?? null
    };
  });
  return {
    idPedido: cab.codigo_pedido ?? cab.nCodPed ?? null,
    numero: cab.numero_pedido ?? cab.cNumero ?? null,
    codigoCliente: cab.codigo_cliente ?? null,
    dataPrevisao: cab.data_previsao || cab.dPrevisao || null,
    etapa: cab.etapa || null,
    status: (info.cStatus || info.status || (info.cCancelada === 'S' ? 'CANCELADO' : (info.cFaturada === 'S' ? 'FATURADO' : 'ATIVO'))),
    cancelada: info.cCancelada === 'S' || info.cancelado === 'S',
    faturada: info.cFaturada === 'S' || info.faturado === 'S',
    obsVenda: obs.obs_venda || null,
    obsInternas: obs.obs_internas || null,
    valorTotal: Number(total.valor_total_pedido || total.nValPedido || 0),
    dataInclusao: dInc,
    dataAlteracao: dAlt,
    alteradoPorLogin: uAlt,
    criadoPorLogin: uInc,
    criadoPorNome: null,         // preenchido depois via mapa de usuarios
    alteradoPorNome: null,       // idem
    itens,
    raw: p
  };
}

// =============================================================================
// Financeiro - Contas a Pagar / Receber: consultar e ALTERAR categoria/depto.
// /financas/contapagar/ -> ConsultarContaPagar / AlterarContaPagar
// /financas/contareceber/ -> ConsultarContaReceber / AlterarContaReceber
// Usado pela tela "Correcao de contas" (corrige categoria/departamento de um
// lancamento direto no Omie). tipo: 'pagar' (default) | 'receber'.
// =============================================================================
function endpointCallConta(tipo: any): { endpoint: string; consultar: string; alterar: string } {
  return String(tipo) === 'receber'
    ? { endpoint: '/financas/contareceber/', consultar: 'ConsultarContaReceber', alterar: 'AlterarContaReceber' }
    : { endpoint: '/financas/contapagar/', consultar: 'ConsultarContaPagar', alterar: 'AlterarContaPagar' };
}

// Consulta um lancamento financeiro pelo codigo_lancamento_omie. Retorna o objeto cru.
export async function consultarConta(conta: Conta, tipo: any, codigoLancamento: any): Promise<any> {
  if (codigoLancamento == null) throw new Error('informe o codigo do lancamento');
  const { endpoint, consultar } = endpointCallConta(tipo);
  return omieRequest(endpoint, consultar, { codigo_lancamento_omie: Number(codigoLancamento) || codigoLancamento }, conta);
}

// Altera categoria e/ou distribuicao (departamentos com rateio %) de um lancamento.
// args: { tipo, codigoLancamento, codigoCategoria?, distribuicao?: [{cCodDep, nPerDep}] }.
// Validado em runtime: o Omie EXIGE `valor_documento` no AlterarConta* quando se
// mexe na distribuicao, entao consultamos o lancamento antes (tb serve de snapshot
// "anterior" p/ auditoria e p/ nao apagar a categoria/distribuicao que nao mudou).
// distribuicao usa percentual (nPerDep); a Omie deriva o valor.
// Retorna { rawRequest, rawResponse, anterior }.
export async function alterarContaCategoriaDepto(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const { tipo, codigoLancamento, codigoCategoria, distribuicao } = args;
  if (codigoLancamento == null) throw new Error('informe o codigo do lancamento');
  const { endpoint, alterar } = endpointCallConta(tipo);
  const atual = await consultarConta(conta, tipo, codigoLancamento);
  const distAtual = Array.isArray(atual.distribuicao) ? atual.distribuicao : [];
  const anterior = {
    codigoCategoria: atual.codigo_categoria || null,
    distribuicao: distAtual.map((d: any) => ({ cCodDep: d.cCodDep, cDesDep: d.cDesDep, nPerDep: d.nPerDep })),
    valorDocumento: atual.valor_documento
  };
  const params: Record<string, any> = {
    codigo_lancamento_omie: Number(codigoLancamento) || codigoLancamento,
    valor_documento: atual.valor_documento
  };
  params.codigo_categoria = (codigoCategoria != null && String(codigoCategoria).trim() !== '')
    ? String(codigoCategoria) : atual.codigo_categoria;
  const distFonte = (Array.isArray(distribuicao) && distribuicao.length) ? distribuicao : distAtual;
  const distFinal = distFonte.map((d: any) => ({ cCodDep: String(d.cCodDep), nPerDep: Number(d.nPerDep) }))
    .filter((d: any) => d.cCodDep && Number.isFinite(d.nPerDep));
  if (distFinal.length) params.distribuicao = distFinal;
  const rawResponse = await omieRequest(endpoint, alterar, params, conta);
  return { rawRequest: params, rawResponse, anterior };
}

// Lista as contas correntes (bancos/caixas) de uma empresa. Usado pela tela
// "Baixar contas" no dropdown de "alterar conta corrente". Filtra inativas.
// Retorna [{ codigo, descricao, tipo, banco }].
export async function listarContasCorrentes(conta: Conta): Promise<any[]> {
  const { itens } = await paginarOmie('/geral/contacorrente/', 'ListarResumoContasCorrentes',
    { apenas_importado_api: 'N' }, conta, { listaKeys: ['conta_corrente_lista', 'conta_corrente_cadastro'] });
  return (itens || [])
    .filter((c: any) => c.inativo !== 'S')
    .map((c: any) => ({ codigo: c.nCodCC, descricao: c.descricao || '', tipo: c.tipo || '', banco: c.codigo_banco || '' }))
    .sort((a: any, b: any) => String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'));
}

// Marca um titulo como pago/recebido no Omie (baixa = LancarPagamento /
// LancarRecebimento). args: { tipo, codigoLancamento, codigoContaCorrente,
// valor, data (DD/MM/AAAA), juros?, multa?, desconto?, observacao?, conciliar? }.
// Antes de baixar consulta o titulo (snapshot "anterior" p/ auditoria + valida que
// nao esta bloqueado/ja liquidado). Retorna { rawRequest, rawResponse, anterior }.
export async function baixarConta(conta: Conta, args: Record<string, any> = {}): Promise<any> {
  const { tipo, codigoLancamento, codigoContaCorrente, valor, data,
    juros, multa, desconto, observacao, conciliar } = args;
  if (codigoLancamento == null) throw new Error('informe o codigo do lancamento');
  if (codigoContaCorrente == null || String(codigoContaCorrente).trim() === '') throw new Error('informe a conta corrente');
  if (valor == null || !(Number(valor) > 0)) throw new Error('informe um valor maior que zero');
  if (!data) throw new Error('informe a data do pagamento');
  const endpoint = String(tipo) === 'receber' ? '/financas/contareceber/' : '/financas/contapagar/';
  const call = String(tipo) === 'receber' ? 'LancarRecebimento' : 'LancarPagamento';

  const atual = await consultarConta(conta, tipo, codigoLancamento);
  const anterior = {
    statusTitulo: atual.status_titulo || null,
    valorDocumento: atual.valor_documento != null ? Number(atual.valor_documento) : null,
    idContaCorrente: atual.id_conta_corrente || null,
    baixaBloqueada: atual.baixa_bloqueada || null
  };
  if (atual.baixa_bloqueada === 'S') { throw omieError('Omie: baixa bloqueada para este titulo', { faultstring: 'Omie: baixa bloqueada para este titulo' }); }

  const params: Record<string, any> = {
    codigo_lancamento: Number(codigoLancamento) || codigoLancamento,
    codigo_conta_corrente: Number(codigoContaCorrente) || codigoContaCorrente,
    valor: Number(valor),
    data: data,
    observacao: observacao || '',
    conciliar_documento: conciliar ? 'S' : 'N'
  };
  if (Number(juros) > 0) params.juros = Number(juros);
  if (Number(multa) > 0) params.multa = Number(multa);
  if (Number(desconto) > 0) params.desconto = Number(desconto);
  const rawResponse = await omieRequest(endpoint, call, params, conta);
  return { rawRequest: params, rawResponse, anterior };
}
