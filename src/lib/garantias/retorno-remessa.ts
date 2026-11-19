// Devolução em garantia pela Omie — regras PURAS (16/11/2026).
//
// O modelo é a remessa que a própria Omie gera pelo Recebimento (conferido na NF 3749 da
// Nova → Kuhn, retorno da NF 222028): mesmos itens, quantidades e preços da nota da fábrica;
// ICMS (origem, CST, alíquota, base, valor), ST, IPI e PIS/COFINS copiados do item de entrada;
// CFOP de saída = o da fábrica (6.949 fora de SP, 5.949 dentro); IBS/CBS 410/410029;
// "não movimentar estoque"; chave da nota da fábrica referenciada. Devolução parcial divide
// base e imposto na proporção da quantidade.
//
// Usado pela tela (prévia) e pelo servidor (payload do IncluirRemessa).

export const CATEGORIA_PADRAO = '1.03.98';
/** NF-e modFrete 9 = sem ocorrência de transporte (o que a Omie pôs na remessa 3749) */
export const FRETE_PADRAO = '9';
export const IBS_CBS_RETORNO = { cCstIbsCbs: '410', cClassTrib: '410029' };

export interface ImpostosEntrada {
  icms?: { cModBC?: string; cOrigem?: string; cSitTrib?: string; nAliq?: number; nBC?: number; nValor?: number; nRedBC?: number } | null;
  st?: { cModBCST?: string; nAliqOP?: number; nAliqST?: number; nBCST?: number; nMargVrAd?: number; nRedBCST?: number; nValorST?: number } | null;
  ipi?: { cEnqIPI?: string; cSitTribIPI?: string; cTpCalcIPI?: string; nAliqIPI?: number; nBCIPI?: number; nValIPI?: number } | null;
  pisCst?: string | null;
  cofinsCst?: string | null;
}

export interface ItemEntrada extends ImpostosEntrada {
  seq: number;
  nCodProd: number | null;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfopForn: string | null;
  qtdNF: number;
  precoUnit: number;
  vTotalItem: number;
  /** a Omie já marcou o item como devolvido (devolução feita pela tela da Omie) */
  devolvidoNaOmie: boolean;
  /** código de benefício fiscal do ICMS na nota da fábrica (cBenef do XML; ex. SP058811) */
  cBenef?: string | null;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => Number(v) || 0;

/** item de garantia = CFOP da fábrica x.949 */
export function ehItemGarantia(cfop: string | null | undefined): boolean {
  return /^[56]\.?949$/.test(String(cfop || '').trim());
}

/** CFOP de saída da remessa de retorno: o mesmo da nota da fábrica (5.949 / 6.949). */
export function cfopRetorno(cfopForn: string | null | undefined): string | null {
  const d = String(cfopForn || '').replace(/\D/g, '');
  if (d === '5949') return '5.949';
  if (d === '6949') return '6.949';
  return null;
}

/** ConsultarRecebimento → itens normalizados (só o que a remessa precisa). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON cru da Omie
export function itensDaEntrada(rec: { itensRecebimento?: Record<string, any>[] } | null | undefined): ItemEntrada[] {
  return (rec?.itensRecebimento || []).map((it) => {
    const ca = it.itensCabec || {};
    const icms = it.itensICMS || {};
    const st = it.itensICMSST || {};
    const ipi = it.itensIPI || {};
    return {
      seq: num(ca.nSequencia),
      nCodProd: num(ca.nIdProduto) || null,
      codigo: ca.cCodigoProduto ?? null,
      descricao: ca.cDescricaoProduto ?? null,
      ncm: ca.cNCM ?? null,
      cfopForn: ca.cCFOP ?? null,
      qtdNF: num(ca.nQtdeNFe),
      precoUnit: num(ca.nPrecoUnit),
      vTotalItem: num(ca.vTotalItem),
      devolvidoNaOmie: ca.cItemDevolvido === 'S',
      icms: { cModBC: icms.cModBC, cOrigem: icms.cOrigem, cSitTrib: icms.cSitTrib, nAliq: num(icms.nAliq), nBC: num(icms.nBC), nValor: num(icms.nValor), nRedBC: num(icms.nRedBC) },
      st: num(st.nValorST) > 0 ? { cModBCST: st.cModBCST, nAliqOP: num(st.nAliqOP), nAliqST: num(st.nAliqST), nBCST: num(st.nBCST), nMargVrAd: num(st.nMargVrAd), nRedBCST: num(st.nRedBCST), nValorST: num(st.nValorST) } : null,
      ipi: { cEnqIPI: ipi.cEnqIPI, cSitTribIPI: ipi.cSitTribIPI, cTpCalcIPI: ipi.cTpCalcIPI || '', nAliqIPI: num(ipi.nAliqIPI), nBCIPI: num(ipi.nBCIPI), nValIPI: num(ipi.nValIPI) },
      pisCst: it.itensPIS?.cSitTribPIS ?? null,
      cofinsCst: it.itensCOFINS?.cSitTribCOFINS ?? it.itensPIS?.cSitTribPIS ?? null,
    };
  });
}

/** quanto do item ainda pode voltar (o que a Omie marcou como devolvido conta inteiro) */
export function disponivel(item: ItemEntrada, jaDevolvido: number): number {
  if (item.devolvidoNaOmie) return 0;
  return Math.max(0, Math.round((item.qtdNF - (Number(jaDevolvido) || 0)) * 1000) / 1000);
}

/** item do IncluirRemessa, espelho do item de entrada na quantidade escolhida */
export function itemRemessa(item: ItemEntrada, qtd: number) {
  const p = item.qtdNF > 0 ? qtd / item.qtdNF : 0;
  const cfop = cfopRetorno(item.cfopForn);
  const out: Record<string, unknown> = {
    // a Omie exige um código por item (nCodIt ou cCodItInt) — sem ele: "Tag [nCodIt] e tag [cCodItInt] não informados!"
    cCodItInt: `RG${item.seq}`,
    nCodProd: item.nCodProd,
    nQtde: qtd,
    nValUnit: item.precoUnit,
    cCFOP: cfop,
    ICMS: {
      cModBC: item.icms?.cModBC || '3',
      cOrigem: item.icms?.cOrigem || '0',
      cSitTrib: item.icms?.cSitTrib || '00',
      nAliq: num(item.icms?.nAliq),
      nBC: r2(num(item.icms?.nBC) * p),
      nValor: r2(num(item.icms?.nValor) * p),
      ...(num(item.icms?.nRedBC) ? { nRedBC: num(item.icms?.nRedBC) } : {}),
    },
    IPI: ipiRetorno(item, p),
    PIS: { cSitTribPIS: item.pisCst || '07' },
    COFINS: { cSitTribCOFINS: item.cofinsCst || item.pisCst || '07' },
    IBS_CBS: { ...IBS_CBS_RETORNO },
    // CST com benefício (ex.: 51 diferido) sem o código = SEFAZ rejeita (930) — NF 8577, 19/11/2026
    infAdicItem: { cNaoMovEstoque: 'S', ...(item.cBenef ? { codigo_benef: item.cBenef } : {}) },
  };
  if (item.st) {
    out.ICMS_ST = {
      cModBCST: item.st.cModBCST || '4',
      nAliqOP: num(item.st.nAliqOP),
      nAliqST: num(item.st.nAliqST),
      nMargVrAd: num(item.st.nMargVrAd),
      nBCST: r2(num(item.st.nBCST) * p),
      nValorST: r2(num(item.st.nValorST) * p),
    };
  }
  return out;
}

/** CST do IPI que exige "tipo de cálculo" na NF-e (tributado): 00, 49, 50, 99 */
const IPI_TRIBUTADO = new Set(['00', '49', '50', '99']);

/** IPI da remessa = o da nota da fábrica. Tributado leva tipo de cálculo, alíquota, base e valor
 *  (sem o tipo a Omie recusa: "falta preencher o Tipo de Cálculo do IPI" — NF 840225 Marchesan, CST 50). */
export function ipiRetorno(item: ItemEntrada, p: number) {
  const cst = item.ipi?.cSitTribIPI || '55';
  const out: Record<string, unknown> = { cSitTribIPI: cst, cEnqIPI: item.ipi?.cEnqIPI || (IPI_TRIBUTADO.has(cst) ? '999' : '115') };
  if (IPI_TRIBUTADO.has(cst)) {
    out.cTpCalcIPI = item.ipi?.cTpCalcIPI || 'B';
    out.nAliqIPI = num(item.ipi?.nAliqIPI);
    out.nBCIPI = r2(num(item.ipi?.nBCIPI) * p);
    out.nValIPI = r2(num(item.ipi?.nValIPI) * p);
  }
  return out;
}

/** valor do item na remessa (produto + ST + IPI, na proporção) */
export function valorItem(item: ItemEntrada, qtd: number): number {
  const p = item.qtdNF > 0 ? qtd / item.qtdNF : 0;
  return r2(qtd * item.precoUnit + num(item.st?.nValorST) * p + num(item.ipi?.nValIPI) * p);
}

export interface Escolha { seq: number; qtd: number }

/** confere a escolha da tela; devolve os erros (vazio = pode emitir) */
export function validarEscolha(itens: ItemEntrada[], escolha: Escolha[], jaDevolvido: Record<number, number>): string[] {
  const erros: string[] = [];
  const validas = escolha.filter((e) => Number(e.qtd) > 0);
  if (!validas.length) erros.push('Escolha ao menos um item com quantidade.');
  for (const e of validas) {
    const it = itens.find((i) => i.seq === e.seq);
    if (!it) { erros.push(`Item ${e.seq} não existe nesta nota.`); continue; }
    const nome = it.codigo || it.descricao || `item ${e.seq}`;
    if (!ehItemGarantia(it.cfopForn)) { erros.push(`${nome}: não veio em garantia (CFOP ${it.cfopForn || '?'}).`); continue; }
    if (!it.nCodProd) { erros.push(`${nome}: o item não está ligado a um produto da Omie.`); continue; }
    const disp = disponivel(it, jaDevolvido[it.seq] || 0);
    if (e.qtd > disp + 1e-9) erros.push(`${nome}: só ${disp} disponível para devolver.`);
  }
  return erros;
}

/** cBenef de cada item (<det nItem="N">) do XML da NF-e. Chave = nº do item = nSequencia do recebimento. */
export function cBenefDoXml(xml: string | null | undefined): Record<number, string> {
  const out: Record<number, string> = {};
  const re = /<det\b[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(xml || '')))) {
    const b = /<cBenef>\s*([^<\s]+)\s*<\/cBenef>/.exec(m[2]);
    if (b) out[Number(m[1])] = b[1];
  }
  return out;
}

/** CST do ICMS que normalmente exige o código de benefício na NF-e de SP */
export function cstPedeBeneficio(cst: string | null | undefined): boolean {
  return ['20', '30', '40', '41', '50', '51', '70', '90'].includes(String(cst || '').trim());
}

export type SituacaoNfe = 'autorizada' | 'rejeitada' | 'aguardando';
/** Situação da NF-e da remessa pelo StatusRemessa: 006 = autorizada; mensagem "Rejeição…"/009 = rejeitada. */
export function situacaoNfe(nfe: { cStatusNFe?: string; mensagens?: Array<{ cCodigo?: string; cDescricao?: string }> } | null | undefined): { situacao: SituacaoNfe; mensagem: string | null } {
  if (!nfe) return { situacao: 'aguardando', mensagem: null };
  const msgs = (nfe.mensagens || []).map((x) => [x.cCodigo, x.cDescricao].filter(Boolean).join(' - ')).filter(Boolean);
  const rej = (nfe.mensagens || []).some((x) => /rejei|deneg/i.test(String(x.cDescricao || '')));
  if (rej || nfe.cStatusNFe === '009') return { situacao: 'rejeitada', mensagem: msgs.join(' · ') || 'A SEFAZ rejeitou a nota.' };
  if (nfe.cStatusNFe === '006') return { situacao: 'autorizada', mensagem: null };
  return { situacao: 'aguardando', mensagem: msgs.join(' · ') || null };
}

/** texto padrão dos dados adicionais (a pessoa pode editar na tela) */
export function textoRetorno(n: { numero: string | null; emissao: string | null; chave: string | null }): string {
  const num = String(n.numero || '').replace(/^0+(?=\d)/, '');
  return `Retorno fiscal de peças recebidas em garantia conforme sua NF ${num || '?'}${n.emissao ? ` de ${n.emissao}` : ''}`
    + `${n.chave ? ` (chave ${n.chave})` : ''}. Operação sem cobrança.`;
}

/** código de integração da remessa na Omie (idempotência) */
export function codIntRem(idReceb: number | string, n: number): string {
  return `RG${idReceb}-${n}`;
}

/** remove < > & do texto (a Omie grava escapado e a NF sai com "&quot;") */
export function limparTexto(s: string): string {
  return String(s || '').replace(/[<>&]/g, ' ').replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, 1800);
}
