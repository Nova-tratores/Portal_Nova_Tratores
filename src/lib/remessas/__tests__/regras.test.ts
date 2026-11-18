import { describe, it, expect } from 'vitest';
import {
  tipoDaRemessa, situacaoDe, prazoDe, cfopRetornoDemo, cfopDemo, avisoDevido, itemRetorno, itemDemo,
  validarDemo, casaBusca, textoRetorno, dataISO, type LinhaRemessa,
} from '../regras';

describe('tipoDaRemessa', () => {
  it('classifica pelo CFOP', () => {
    expect(tipoDaRemessa('5.912')).toBe('demonstracao');
    expect(tipoDaRemessa('6912')).toBe('demonstracao');
    expect(tipoDaRemessa('6.913')).toBe('retorno_forn');
    expect(tipoDaRemessa('5.949')).toBe('garantia');
    expect(tipoDaRemessa('5.915')).toBe('conserto');
    expect(tipoDaRemessa('5.910')).toBe('os');
    expect(tipoDaRemessa('', 'rem_os_812')).toBe('os');
    expect(tipoDaRemessa('5.202')).toBe('outra');
  });
});

describe('situação e prazo', () => {
  const demo = { tipo: 'demonstracao' as const, status: 'Faturada', emissao: '05/11/2026' };
  it('prazo padrão = emissão + 30 dias', () => {
    expect(prazoDe(demo)).toBe('2026-12-05');
    expect(prazoDe({ ...demo, prazoAte: '2026-11-20' })).toBe('2026-11-20');
  });
  it('em dia, vence logo e vencida', () => {
    expect(situacaoDe(demo, '2026-11-18')).toBe('em_demonstracao');
    expect(situacaoDe(demo, '2026-12-01')).toBe('vence_logo');
    expect(situacaoDe(demo, '2026-12-06')).toBe('vencida');
  });
  it('decisão manual e espelho vencem o prazo', () => {
    expect(situacaoDe({ ...demo, manual: 'virou_venda' }, '2027-01-01')).toBe('virou_venda');
    expect(situacaoDe({ ...demo, status: 'Devolvida' }, '2027-01-01')).toBe('devolvida');
    expect(situacaoDe({ ...demo, status: 'Cancelada', manual: 'renovada' })).toBe('cancelada');
    expect(situacaoDe({ ...demo, status: 'Suspeita' })).toBe('conferir');
    expect(situacaoDe({ tipo: 'garantia', status: 'Faturada', emissao: '01/01/2026' })).toBe('faturada');
    expect(situacaoDe({ tipo: 'os', status: 'Aberta', emissao: null })).toBe('sem_nota');
  });
  it('aviso só sobe de nível', () => {
    expect(avisoDevido('vence_logo', 0)).toBe(1);
    expect(avisoDevido('vence_logo', 1)).toBe(0);
    expect(avisoDevido('vencida', 1)).toBe(2);
    expect(avisoDevido('em_demonstracao', 0)).toBe(0);
  });
});

describe('CFOP', () => {
  it('volta e saída', () => {
    expect(cfopRetornoDemo('5.912')).toBe('1.913');
    expect(cfopRetornoDemo('6.912')).toBe('2.913');
    expect(cfopDemo('SP')).toBe('5.912');
    expect(cfopDemo('pr')).toBe('6.912');
  });
});

describe('itens', () => {
  // item da remessa 3796 (NOVA → Marcus Vinicius), resumido
  const itRem = {
    nCodProd: 2521749982, nQtde: 1, nValUnit: 165000, cCFOP: '5.912', codigo_local_estoque: 1940054405,
    ICMS: { cModBC: '3', cOrigem: '6', cSitTrib: '60' }, PIS: { cSitTribPIS: '04' }, COFINS: { cSitTribCOFINS: '04' },
    IBS_CBS: { cCstIbsCbs: '000', cClassTrib: '000001' },
  };
  // item da nota de entrada 590 (retorno 1.913)
  const modeloRet = { PIS: { cSitTribPIS: '98' }, COFINS: { cSitTribCOFINS: '98' }, ICMS: { cOrigem: '0', cSitTrib: '60' }, IBS_CBS: { cCstIbsCbs: '000', cClassTrib: '000001' } };
  it('retorno copia produto e ICMS da remessa e PIS/COFINS da última volta', () => {
    const r = itemRetorno(itRem, '1.913', modeloRet) as Record<string, Record<string, unknown> & number>;
    expect(r.nCodProd).toBe(2521749982);
    expect(r.cCFOP).toBe('1.913');
    expect(r.codigo_local_estoque).toBe(1940054405);
    expect(r.ICMS.cOrigem).toBe('6');
    expect(r.PIS.cSitTribPIS).toBe('98');
  });
  it('demonstração usa o fiscal do modelo', () => {
    const d = itemDemo({ nCodProd: 1, qtd: 1, valorUnit: 85000.004 }, '5.912', itRem) as Record<string, Record<string, unknown> & number>;
    expect(d.nValUnit).toBe(85000);
    expect(d.codigo_local_estoque).toBe(1940054405);
    expect(d.COFINS.cSitTribCOFINS).toBe('04');
  });
});

describe('validarDemo', () => {
  it('pede cliente, máquina, valor e prazo futuro', () => {
    expect(validarDemo({ itens: [], prazoAte: null, hoje: '2026-11-18' })).toHaveLength(3);
    expect(validarDemo({ nCodCli: 1, itens: [{ nCodProd: 1, qtd: 1, valorUnit: 10 }], prazoAte: '2026-11-18', hoje: '2026-11-18' })).toEqual(['O prazo de retorno tem que ser depois de hoje.']);
    expect(validarDemo({ nCodCli: 1, itens: [{ nCodProd: 1, qtd: 1, valorUnit: 10 }], prazoAte: '2026-12-18', hoje: '2026-11-18' })).toEqual([]);
  });
});

describe('texto e busca', () => {
  it('texto do retorno cita a NF sem zeros', () => {
    expect(textoRetorno({ nfRemessa: '00008530', emissao: '2026-11-05' })).toBe('RETORNO DE MERCADORIA REMETIDA PARA DEMONSTRACAO CONFORME NF 8530 DE 05/11/2026');
  });
  it('busca por nº sem zeros, nome sem acento e item', () => {
    const l: LinhaRemessa = {
      conta: 'nova', idRemessa: 1, numero: '3796', emissao: dataISO('05/11/2026'), cfop: '5.912', tipo: 'demonstracao', status: 'Faturada',
      situacao: 'em_demonstracao', destinatario: 'MARCUS VINÍCIUS', cnpj: '123.456.789-00', total: 165000, itens: ['TRATOR 6075'],
      prazoAte: '2026-12-05', diasPrazo: 17, obs: '', origemPortal: false, renovadaDe: null, renovadaPara: null,
    };
    expect(casaBusca(l, '03796')).toBe(true);
    expect(casaBusca(l, 'vinicius')).toBe(true);
    expect(casaBusca(l, '6075')).toBe(true);
    expect(casaBusca(l, 'kuhn')).toBe(false);
  });
});
