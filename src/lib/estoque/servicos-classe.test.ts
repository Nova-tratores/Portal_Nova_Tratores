import { describe, it, expect } from 'vitest';
import { classificarOS, ehNaoComercial, totalNaoComercial } from './servicos-classe';

describe('classificarOS', () => {
  it('categoria de campanha vence tudo (comissão não é serviço)', () => {
    expect(classificarOS([{ categoria: '1.02.02', descricao: 'COMISSÃO DE VENDAS AGRISHOW' }, { categoria: '1.01.01' }]).classe).toBe('campanha');
  });
  it('garantia pela categoria ou pelo contrato -pgo; a OS inteira vira garantia', () => {
    expect(classificarOS([{ categoria: '1.01.01' }, { categoria: '1.01.93', descricao: 'Deslocamento por KM' }]).classe).toBe('garantia');
    const r = classificarOS([{ categoria: '1.01.02', contrato: 'Kuhn-pgo' }]);
    expect(r).toEqual({ classe: 'garantia', motivo: 'contrato "Kuhn-pgo" (fábrica paga)' });
    expect(classificarOS([{ categoria: '1.01.02', contrato: 'Mahindra - pgo' }]).classe).toBe('garantia');
  });
  it('seguro pelo nome do cliente', () => {
    expect(classificarOS([{ categoria: '1.01.02' }], 'DLL CORRETORA DE SEGUROS').classe).toBe('seguro');
    expect(classificarOS([{ categoria: '1.01.02' }], 'YELUM SEGUROS S.A').classe).toBe('seguro');
    expect(classificarOS([{ categoria: '1.01.02' }], 'SEGURADORA X').classe).toBe('seguro');
    expect(classificarOS([{ categoria: '1.01.02' }], 'JOSÉ SEGURADO DA SILVA').classe).toBe('comercial');
    expect(classificarOS([{ categoria: '1.01.02' }], 'INSS Instituto Nacional Seguro Social').classe).toBe('comercial');
    expect(classificarOS([{ categoria: '1.01.02' }], 'COSTA EQUIPAMENTOS DE SEGURANCA').classe).toBe('comercial');
  });
  it('promoção: contrato de cortesia ou descrição promocional', () => {
    expect(classificarOS([{ categoria: '1.01.02', contrato: 'Cortesia Comercial' }]).classe).toBe('promocao');
    expect(classificarOS([{ categoria: '1.01.02', descricao: 'Serviços prestados como promoção de vendas' }]).classe).toBe('promocao');
  });
  it('o resto é comercial (inclusive contratos que não são de fábrica)', () => {
    expect(classificarOS([{ categoria: '1.01.02', contrato: 'REVISAO' }, { categoria: '1.01.93' }], 'FAZENDA BOA VISTA').classe).toBe('comercial');
    expect(classificarOS([]).classe).toBe('comercial');
  });
  it('helpers', () => {
    expect(ehNaoComercial('garantia')).toBe(true);
    expect(ehNaoComercial('comercial')).toBe(false);
    expect(ehNaoComercial(null)).toBe(false);
    expect(totalNaoComercial({ comercial: 100, garantia: 10, campanha: 5, seguro: 2, promocao: 1 })).toBe(18);
  });
});
