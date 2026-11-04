import { describe, it, expect } from 'vitest';
import {
  extrairSGs, extrairDRVG, normSG, componenteDoItem, somarComponentes,
  casarPecas, ehCfopGarantia, textoSGs, montarPreviaReembolso,
} from '../notas';

describe('extrairSGs', () => {
  it('Mahindra: ano só na primeira SG', () => {
    const t = 'PEDIDO DE COMPRA 3400885894| VALOR: R$4.499,13| REFERENTE A DRVG 7642 DA SOLICITACAO DE GARANTIA SG 2026-046, 48, 62, 63, 67, 69, 70 e 71|Hora Trabalhada';
    expect(extrairSGs(t)).toEqual(['2026-046', '2026-048', '2026-062', '2026-063', '2026-067', '2026-069', '2026-070', '2026-071']);
    expect(extrairDRVG(t)).toBe('7642');
  });
  it('Kuhn: SG com letras soltas antes do número', () => {
    const t = 'SERVIÇO FEITO EM PROL DA SOLICITAÇÃO DE GARANTIA B M 7742194 PARA SDM|Hora Trabalhada - STRONGER 4000 HD - SG 3 3 7745686|Entrega Técnica - ACCURA 12000 - SG B M 7743900';
    expect(extrairSGs(t).sort()).toEqual(['7742194', '7743900', '7745686']);
  });
  it('texto sem SG', () => {
    expect(extrairSGs('Hora Trabalhada')).toEqual([]);
  });
});

describe('normSG', () => {
  it('padroniza', () => {
    expect(normSG('2026-67')).toBe('2026-067');
    expect(normSG('2026-067')).toBe('2026-067');
    expect(normSG('B M 7742194')).toBe('7742194');
    expect(normSG('')).toBe('');
  });
});

describe('componentes', () => {
  it('classifica os itens da OS do Omie', () => {
    expect(componenteDoItem('PEDIDO DE COMPRA 3400885894', 0.000001)).toBe('texto');
    expect(componenteDoItem('Hora Trabalhada', 1794.83)).toBe('mao_obra');
    expect(componenteDoItem('Deslocamento por KM - ACCURA 12000 - SG B M 7743900', 159)).toBe('deslocamento');
    expect(componenteDoItem('Peças', 728.2)).toBe('pecas');
    expect(componenteDoItem('Entrega Técnica - ACCURA 12000', 400)).toBe('mao_obra');
    expect(componenteDoItem('Serviço de terceiros - torno', 300)).toBe('terceiros');
  });
  it('soma por componente', () => {
    const t = somarComponentes([
      { descricao: 'texto', valor: 0.000001 },
      { descricao: 'Hora Trabalhada', valor: 1794.8293 },
      { descricao: 'Deslocamento por KM', valor: 1976.1 },
      { descricao: 'Peças', valor: 728.2 },
    ]);
    expect(t.mao_obra).toBe(1794.83);
    expect(t.deslocamento).toBe(1976.1);
    expect(t.pecas).toBe(728.2);
  });
});

describe('peças recebidas', () => {
  it('CFOP de remessa em garantia', () => {
    expect(ehCfopGarantia('2.949')).toBe(true);
    expect(ehCfopGarantia('6949')).toBe(true);
    expect(ehCfopGarantia('2.102')).toBe(false);
  });
  it('casa por código e pela descrição; ignora chassi e requisição', () => {
    const pecas = [
      { cod_produto: 'RP-E007206114D1', descricao: 'MANGOTE' },
      { cod_produto: 'B2177510', descricao: 'TUBO' },
      { cod_produto: 'MDI07513ES0006198', descricao: 'TRATOR' },
      { cod_produto: 'REQ-6025', descricao: 'requisição' },
    ];
    const itens = [
      { codigo: 'RP-E007206114D1', descricao: 'MANGOTE DE REDUCAO 6075', cfop: '2.949', valor: 11.92, quantidade: 1 },
      { codigo: '99999', descricao: 'TUBO HIDRAULICO = B2177510', cfop: '2.949', valor: 50, quantidade: 1 },
      { codigo: 'XYZ', descricao: 'OUTRA PECA', cfop: '2.949', valor: 5, quantidade: 1 },
    ];
    expect(casarPecas(pecas, itens)).toEqual([
      { item: 0, peca: 'RP-E007206114D1', como: 'codigo' },
      { item: 1, peca: 'B2177510', como: 'descricao' },
    ]);
  });
});

describe('prévia da OS de reembolso', () => {
  it('texto no padrão do faturista', () => {
    expect(textoSGs(['2026-046', '2026-48', '2026-071'])).toBe('SG 2026-046, 48 e 71');
    expect(textoSGs(['2026-067'])).toBe('SG 2026-067');
  });
  it('soma os componentes das garantias', () => {
    const p = montarPreviaReembolso([
      { numero: 'GAR-1', numero_externo: '2026-063', valor_pago_horas: 726, valor_pago_km: 350.7, valor_pago_pecas: 728.2 },
      { numero: 'GAR-2', numero_externo: '2026-067', valor_pago_horas: 121, valor_pago_km: 214.2, valor_pago_pecas: 0 },
    ], { drvg: '7642' });
    expect(p.total).toBe(2140.1);
    expect(p.itens.map((i) => [i.descricao, i.valor])).toEqual([
      ['Hora Trabalhada', 847], ['Deslocamento por KM', 564.9], ['Peças', 728.2],
    ]);
    expect(p.texto).toContain('REFERENTE A DRVG 7642 DA SOLICITACAO DE GARANTIA SG 2026-063 e 67');
  });
});
