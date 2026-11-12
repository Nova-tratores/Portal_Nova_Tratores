import { describe, it, expect } from 'vitest';
import {
  classificarTipoReceb, sinalGarantia, prepararRecebimento, recebimentoDoEspelho,
  casaBusca, semZerosEsq, diasDesde, dataBR,
} from '../recebimento-regras';
import type { AjustesConfig } from '../config';

const cfg: AjustesConfig = {
  cfopsGarantia: ['5.949'], cfopsGarantiaNorm: new Set(['5949']),
  thresholdCustoBaixo: 0.5, lookbackMeses: 12, cacheTtlSeg: 600,
};

// linha real do espelho (AUTO POSTO 2001, CASTRO, 09/11/2026)
const LINHA_POSTO = {
  id_receb: 6059363446,
  chave_nfe: '35261166037086000135550020000167511666505709',
  numero_nfe: '000016751', serie_nfe: '2', emissao_nfe: '2026-11-09', etapa: '40', status: 'Faturada',
  id_fornecedor: 5251119602, fornecedor: 'AUTO POSTO 2001', fornecedor_razao: 'AUTO POSTO 2001 IRELII',
  fornecedor_cnpj: '66.037.086/0001-35', total_nfe: 379.45, maquinas: [],
  produtos: [{ cNCM: '2207.10.90', cCFOP: '5.929', nQtde: 90.561, vTotal: 379.45, cCodigo: '000004', nValUnit: 4.19, cDescricao: 'ETANOL V-POWER', nSequencia: 1, nCodProduto: 0, cCFOPEntrada: '', cAdicionarNovo: 'S', cAssociarExistente: 'N' }],
  natureza: '79714 - VENDA REG ECF SIMP FAT',
};

describe('recebimentoDoEspelho', () => {
  it('monta a nota do jeito que a tela usa', () => {
    const r = recebimentoDoEspelho(LINHA_POSTO);
    expect(r.numeroNFe).toBe('000016751');
    expect(r.dataEmissao).toBe('09/11/2026');
    expect(r.fornecedorNome).toBe('AUTO POSTO 2001 IRELII');
    expect(r.valorNFe).toBe(379.45);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ idProduto: null, criarNovo: true, cfop: '5.929', cfopEntrada: null, cfopEntradaSugerido: '1.929', qtde: 90.561 });
  });
  it('não repete item que está em produtos e em maquinas', () => {
    const p = { nSequencia: 1, cDescricao: 'TRATOR', nQtde: 1, nValUnit: 200000, nCodProduto: 9 };
    const r = recebimentoDoEspelho({ ...LINHA_POSTO, produtos: [p], maquinas: [p, { ...p, nSequencia: 2 }] });
    expect(r.itens.map((i) => i.nSequencia)).toEqual([1, 2]);
  });
});

describe('tipo e sinal', () => {
  it('posto = combustível', () => {
    const r = prepararRecebimento(recebimentoDoEspelho(LINHA_POSTO), cfg);
    expect(r.tipo).toBe('combustivel');
    expect(r.temSinalGarantia).toBe(false);
  });
  it('garantia pela natureza ou pelo CFOP', () => {
    expect(sinalGarantia({ naturezaOperacao: 'REMESSA EM GARANTIA', itens: [] }, cfg)).toBe('natureza');
    expect(sinalGarantia({ naturezaOperacao: 'VENDA', itens: [{ cfop: '5.949' } as never] }, cfg)).toBe('cfop');
  });
  it('máquina = item de 10 mil ou mais', () => {
    expect(classificarTipoReceb({ itens: [{ descricaoProduto: 'TRATOR', valTotalItem: 150000 }] }, false)).toBe('maquinas');
    expect(classificarTipoReceb({ itens: [{ descricaoProduto: 'FILTRO', valTotalItem: 90 }] }, false)).toBe('pecas');
  });
  it('tipo manual vence o automático', () => {
    const r = prepararRecebimento(recebimentoDoEspelho(LINHA_POSTO), cfg, 'almoxarifado');
    expect(r.tipo).toBe('almoxarifado');
    expect(r.tipoAuto).toBe('combustivel');
    expect(r.tipoManual).toBe(true);
    expect(prepararRecebimento(recebimentoDoEspelho(LINHA_POSTO), cfg, 'xyz').tipo).toBe('combustivel');
  });
});

describe('casaBusca', () => {
  const r = recebimentoDoEspelho(LINHA_POSTO);
  it('número com ou sem zeros à esquerda', () => {
    expect(casaBusca(r, '16751')).toBe(true);
    expect(casaBusca(r, '016751')).toBe(true);
    expect(casaBusca(r, '000016751')).toBe(true);
    expect(casaBusca(r, '1675')).toBe(false);
  });
  it('CNPJ, chave, fornecedor, item e valor', () => {
    expect(casaBusca(r, '66.037.086')).toBe(true);
    expect(casaBusca(r, '66037086000135')).toBe(true);
    expect(casaBusca(r, '35261166037086000135550020000167511666505709')).toBe(true);
    expect(casaBusca(r, 'auto posto')).toBe(true);
    expect(casaBusca(r, 'etanol')).toBe(true);
    expect(casaBusca(r, '379,45')).toBe(true);
    expect(casaBusca(r, 'R$ 379,45')).toBe(true);
    expect(casaBusca(r, 'cambuci')).toBe(false);
  });
});

describe('helpers', () => {
  it('semZerosEsq', () => {
    expect(semZerosEsq('000016751')).toBe('16751');
    expect(semZerosEsq('0')).toBe('0');
  });
  it('dataBR e diasDesde', () => {
    expect(dataBR('2026-11-09')).toBe('09/11/2026');
    expect(diasDesde('09/11/2026', new Date(2026, 10, 10, 15))).toBe(1);
    expect(diasDesde('2026-11-10', new Date(2026, 10, 10))).toBe(0);
    expect(diasDesde(null)).toBeNull();
  });
});
