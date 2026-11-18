import { describe, it, expect } from 'vitest';
import { itensDaEntrada, itemRemessa, valorItem, validarEscolha, disponivel, cfopRetorno, ehItemGarantia, textoRetorno, codIntRem, limparTexto } from '../retorno-remessa';

// Itens reais da NF 222028 da Kuhn (NOVA, recebimento 2526470642) — a Omie gerou a remessa 3749.
const rec = {
  itensRecebimento: [
    {
      itensCabec: { nSequencia: 1, nIdProduto: 2528337067, cCodigoProduto: '80061043', cCFOP: '6.949', nQtdeNFe: 4, nPrecoUnit: 1.67, vTotalItem: 6.68 },
      itensICMS: { cModBC: '3', cOrigem: '3', cSitTrib: '00', nAliq: 4, nBC: 6.68, nValor: 0.27 },
      itensIPI: { cEnqIPI: '115', cSitTribIPI: '55' }, itensPIS: { cSitTribPIS: '07' },
    },
    {
      itensCabec: { nSequencia: 8, nIdProduto: 2528337111, cCodigoProduto: 'B4011152', cCFOP: '6.949', nQtdeNFe: 1, nPrecoUnit: 302.22, vTotalItem: 366.45 },
      itensICMS: { cModBC: '3', cOrigem: '0', cSitTrib: '10', nAliq: 12, nBC: 302.22, nValor: 36.27 },
      itensICMSST: { cModBCST: '4', nAliqOP: 12, nAliqST: 18, nBCST: 558.35, nMargVrAd: 84.75, nValorST: 64.23 },
      itensIPI: { cEnqIPI: '115', cSitTribIPI: '55' }, itensPIS: { cSitTribPIS: '07' },
    },
    {
      itensCabec: { nSequencia: 9, nIdProduto: 5, cCodigoProduto: 'X', cCFOP: '6.102', nQtdeNFe: 2, nPrecoUnit: 10, vTotalItem: 20, cItemDevolvido: 'N' },
      itensICMS: {}, itensIPI: {}, itensPIS: {},
    },
  ],
};

describe('devolução em garantia (remessa de retorno)', () => {
  const itens = itensDaEntrada(rec);

  it('espelha o item inteiro igual à remessa 3749 da Omie', () => {
    const r = itemRemessa(itens[0], 4) as any;
    expect(r).toMatchObject({ nCodProd: 2528337067, nQtde: 4, nValUnit: 1.67, cCFOP: '6.949' });
    expect(r.ICMS).toEqual({ cModBC: '3', cOrigem: '3', cSitTrib: '00', nAliq: 4, nBC: 6.68, nValor: 0.27 });
    expect(r.IPI).toEqual({ cSitTribIPI: '55', cEnqIPI: '115' });
    expect(r.IBS_CBS).toEqual({ cCstIbsCbs: '410', cClassTrib: '410029' });
    expect(r.infAdicItem).toEqual({ cNaoMovEstoque: 'S' });
    expect(r.ICMS_ST).toBeUndefined();
  });

  it('leva a ST do item de entrada e soma no valor', () => {
    const r = itemRemessa(itens[1], 1) as any;
    expect(r.ICMS_ST).toMatchObject({ nBCST: 558.35, nValorST: 64.23, nMargVrAd: 84.75, nAliqST: 18 });
    expect(valorItem(itens[1], 1)).toBe(366.45);
  });

  it('devolução parcial divide base e imposto pela quantidade', () => {
    const r = itemRemessa(itens[0], 2) as any;
    expect(r.ICMS.nBC).toBe(3.34);
    expect(r.ICMS.nValor).toBe(0.14);
  });

  it('valida quantidade, CFOP de garantia e o que já voltou', () => {
    expect(validarEscolha(itens, [], {})).toEqual(['Escolha ao menos um item com quantidade.']);
    expect(validarEscolha(itens, [{ seq: 1, qtd: 3 }], { 1: 2 })[0]).toMatch(/só 2 disponível/);
    expect(validarEscolha(itens, [{ seq: 9, qtd: 1 }], {})[0]).toMatch(/não veio em garantia/);
    expect(validarEscolha(itens, [{ seq: 1, qtd: 4 }, { seq: 8, qtd: 1 }], {})).toEqual([]);
  });

  it('item devolvido pela tela da Omie não volta de novo', () => {
    expect(disponivel({ ...itens[0], devolvidoNaOmie: true }, 0)).toBe(0);
    expect(disponivel(itens[0], 1)).toBe(3);
  });

  it('CFOP, texto, código e limpeza', () => {
    expect(cfopRetorno('6.949')).toBe('6.949');
    expect(cfopRetorno('5949')).toBe('5.949');
    expect(cfopRetorno('6.102')).toBeNull();
    expect(ehItemGarantia('6.949')).toBe(true);
    expect(textoRetorno({ numero: '000222028', emissao: '14/08/2026', chave: null })).toContain('NF 222028 de 14/08/2026');
    expect(codIntRem(2526470642, 1)).toBe('RG2526470642-1');
    expect(limparTexto('a <b> & "c"')).toBe("a b 'c'");
  });
});
