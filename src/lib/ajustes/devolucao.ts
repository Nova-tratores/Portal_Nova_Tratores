/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Devolucao de compra em OPERACAO TRIANGULAR (preparar/conferir).
//
// Contexto: o fornecedor FATURA (ex.: JTZ) mas quem ENTREGA e' um terceiro por
// conta e ordem (ex.: A-4 Armazens). Para devolver, o procedimento exige DUAS
// notas com tratamento fiscal OPOSTO:
//
//   1) DEVOLUCAO DE COMPRA -> faturador (CFOP 5411/6411)
//      destaca TODOS os impostos da NF de faturamento (ICMS-ST, PIS, COFINS, IPI)
//      + a BASE e o VALOR do ICMS que vem da NF de REMESSA do terceiro.
//      (e' por isso que era impossivel preencher a mao: os impostos vem de DUAS
//      notas diferentes)
//
//   2) REMESSA POR CONTA E ORDEM -> terceiro (CFOP 5923/6923)
//      SEM destaque de ICMS - so o valor dos produtos e o total.
//
// Este modulo SO LE do Omie e monta a ficha. NAO emite documento fiscal: quem
// emite e' o usuario, no Omie. (Alem disso o Omie NAO tem API de "Devolucao ao
// Fornecedor" - so daria para emitir via Remessa + Faturamento.)
// =============================================================================
import { omieRequest } from './omie';
import type { Conta } from './conta';

const num = (v: any): number => (v == null ? 0 : Number(v) || 0);

export interface ItemDevolucao {
  seq: number;
  codigo: string | null;
  descricao: string | null;
  chassi: string | null;
  cfop: string | null;
  qtde: number;
  valUnit: number;
  valTotal: number;
}

export interface NotaDevolucao {
  numero: string | null;
  serie: string | null;
  chaveNFe: string | null;
  dataEmissao: string | null;
  emitenteCnpj: string | null;
  emitenteNome: string | null;
  emitenteIE: string | null;
  emitenteEndereco: string | null;
  emitenteUF: string | null;
  interestadual: boolean;      // derivado do CFOP de entrada (1.x = interno, 2.x = interestadual)
  // totais (ICMSTot) - usados como base dos impostos a destacar
  vProd: number; vNF: number;
  vBC: number; vICMS: number;
  vBCST: number; vST: number;
  vIPI: number; vPIS: number; vCOFINS: number;
  itens: ItemDevolucao[];
}

export interface FichaDevolucao {
  faturamento: NotaDevolucao | null;
  remessa: NotaDevolucao | null;
  avisos: string[];
}

// O chassi costuma vir dentro da descricao ("... Chassi: 99KSDSZ8ATM100241") ou
// no infAdProd. 17 caracteres alfanumericos (padrao VIN).
function extrairChassi(...textos: (string | null | undefined)[]): string | null {
  for (const t of textos) {
    if (!t) continue;
    const m = String(t).match(/chassi\s*:?\s*([A-Z0-9]{17})/i) || String(t).match(/\b([A-Z0-9]{17})\b/);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

// CNPJ do emitente sai da propria chave da NF-e (posicoes 6..20).
function cnpjDaChave(chave: string | null): string | null {
  if (!chave) return null;
  const d = String(chave).replace(/\D/g, '');
  return d.length === 44 ? d.substring(6, 20) : null;
}

export function fmtCnpj(c: string | null): string | null {
  if (!c) return null;
  const d = c.replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
}

/** Busca dados cadastrais (IE, endereco) pelo CNPJ. Ver [[omie-consultarcliente-cnpj]]:
 *  ConsultarCliente NAO aceita cnpj_cpf - so ListarClientes + clientesFiltro. */
async function buscarFornecedor(conta: Conta, cnpj: string | null): Promise<any | null> {
  if (!cnpj) return null;
  try {
    const r = await omieRequest('/geral/clientes/', 'ListarClientes', {
      pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N',
      clientesFiltro: { cnpj_cpf: fmtCnpj(cnpj) },
    }, conta);
    return (r?.clientes_cadastro || [])[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Consulta UMA NF de entrada pelo numero. O Omie devolve o numero com ZEROS A
 * ESQUERDA, entao a comparacao aqui e' numerica. Se a serie nao for informada,
 * tenta as series mais comuns (1..4) - ConsultarNF exige serie.
 */
export async function consultarNotaEntradaPorNumero(
  conta: Conta, numero: string | number, serie?: string | number | null,
): Promise<any | null> {
  const series = serie != null && String(serie).trim() !== '' ? [String(serie)] : ['1', '2', '3', '4'];
  for (const s of series) {
    try {
      const r = await omieRequest('/produtos/nfconsultar/', 'ConsultarNF', {
        nNF: String(numero), serie: s, tpNF: '0', tpAmb: '1',
      }, conta);
      if (r && !r.faultstring && (r.ide || r.det)) return r;
    } catch {
      /* serie errada -> tenta a proxima */
    }
  }
  return null;
}

function normalizar(nf: any): NotaDevolucao | null {
  if (!nf) return null;
  const ide = nf.ide || {};
  const compl = nf.compl || {};
  const tot = (nf.total || {}).ICMSTot || {};
  const chave = compl.cChaveNFe || compl.cChaveNfe || null;

  const itens: ItemDevolucao[] = [];
  const det = Array.isArray(nf.det) ? nf.det : [];
  det.forEach((d: any, i: number) => {
    const p = d.prod || {};
    itens.push({
      seq: i + 1,
      codigo: p.cProd ?? null,
      descricao: p.xProd ?? null,
      chassi: extrairChassi(p.xProd, d.infAdProd, p.cProd),
      cfop: p.CFOP != null ? String(p.CFOP) : null,
      qtde: num(p.qCom),
      valUnit: num(p.vUnCom),
      valTotal: num(p.vProd),
    });
  });

  // 1.xxx = entrada dentro do estado; 2.xxx = interestadual -> define 5411/6411 e 5923/6923
  const cfop0 = String(itens[0]?.cfop || '').replace(/\D/g, '')[0] || '';
  return {
    numero: ide.nNF != null ? String(Number(String(ide.nNF).replace(/\D/g, '')) || ide.nNF) : null,
    serie: ide.serie != null ? String(ide.serie) : null,
    chaveNFe: chave,
    dataEmissao: ide.dhEmi || ide.dEmi || null,
    emitenteCnpj: cnpjDaChave(chave),
    emitenteNome: null, emitenteIE: null, emitenteEndereco: null, emitenteUF: null,
    interestadual: cfop0 === '2' || cfop0 === '3',
    vProd: num(tot.vProd), vNF: num(tot.vNF),
    vBC: num(tot.vBC), vICMS: num(tot.vICMS),
    vBCST: num(tot.vBCST), vST: num(tot.vST),
    vIPI: num(tot.vIPI), vPIS: num(tot.vPIS), vCOFINS: num(tot.vCOFINS),
    itens,
  };
}

async function enriquecer(conta: Conta, n: NotaDevolucao | null): Promise<NotaDevolucao | null> {
  if (!n) return null;
  const f = await buscarFornecedor(conta, n.emitenteCnpj);
  if (f) {
    n.emitenteNome = (f.razao_social || f.nome_fantasia) ?? null;
    n.emitenteIE = f.inscricao_estadual || null;
    n.emitenteUF = f.estado || null;
    const partes = [
      [f.endereco, f.endereco_numero].filter(Boolean).join(', '),
      f.complemento, f.bairro,
      [f.cidade, f.estado].filter(Boolean).join('/'),
      f.cep ? `CEP ${String(f.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : null,
    ].filter((x) => x && String(x).trim());
    n.emitenteEndereco = partes.join(', ') || null;
  }
  return n;
}

/**
 * Monta a ficha: consulta a NF de FATURAMENTO (faturador) e a NF de REMESSA
 * (terceiro que entregou), enriquece com os cadastros e devolve tudo o que o
 * usuario precisa digitar no Omie.
 */
export async function montarFichaDevolucao(conta: Conta, args: {
  faturamentoNumero: string | number; faturamentoSerie?: string | null;
  remessaNumero?: string | number | null; remessaSerie?: string | null;
}): Promise<FichaDevolucao> {
  const avisos: string[] = [];

  const nfFat = await consultarNotaEntradaPorNumero(conta, args.faturamentoNumero, args.faturamentoSerie);
  if (!nfFat) avisos.push(`NF de faturamento ${args.faturamentoNumero} nao encontrada nesta conta (confira o numero/serie e a conta NOVA/CASTRO).`);

  let nfRem: any = null;
  if (args.remessaNumero != null && String(args.remessaNumero).trim() !== '') {
    nfRem = await consultarNotaEntradaPorNumero(conta, args.remessaNumero, args.remessaSerie);
    if (!nfRem) avisos.push(`NF de remessa ${args.remessaNumero} nao encontrada nesta conta.`);
  }

  const faturamento = await enriquecer(conta, normalizar(nfFat));
  const remessa = await enriquecer(conta, normalizar(nfRem));

  if (faturamento && !remessa) {
    avisos.push('Sem a NF de remessa nao da para preencher a BASE e o VALOR do ICMS da devolucao (o procedimento manda pegar da nota do terceiro).');
  }
  if (faturamento && faturamento.itens.length > 1) {
    avisos.push('A nota tem mais de um item: o Omie nao devolve imposto POR ITEM (det[].imposto vem nulo), so os TOTAIS da nota. Confira o rateio com a contabilidade.');
  }
  if (faturamento && faturamento.itens.some((i) => !i.chassi)) {
    avisos.push('Nao consegui extrair o chassi de todos os itens - confira, pois o procedimento exige o chassi destacado nas duas notas.');
  }
  if (faturamento) {
    const somaItens = faturamento.itens.reduce((a, i) => a + i.valTotal, 0);
    if (Math.abs(somaItens - faturamento.vProd) > 0.01) {
      avisos.push(`Soma dos itens (${somaItens.toFixed(2)}) difere do vProd da nota (${faturamento.vProd.toFixed(2)}).`);
    }
    if (Math.abs(faturamento.vNF - (faturamento.vProd + faturamento.vST)) > 0.01) {
      avisos.push(`vNF (${faturamento.vNF.toFixed(2)}) nao bate com vProd + ICMS-ST (${(faturamento.vProd + faturamento.vST).toFixed(2)}) - pode haver frete/outras despesas. Confirme a base com a contabilidade.`);
    }
  }

  return { faturamento, remessa, avisos };
}
