import { describe, it, expect } from 'vitest';
import {
  normalizarReqAbastecimento,
  parseHodometroReq,
  parseValorMisto,
  PLACA_QUADRI,
  PLACA_TRATOR,
  type ReqAbastRow,
} from '../requisicoes';
import { heatmapDiaHora, intervalosAbastecimento, type LinhaDash } from '../agregacoes';

const reqBase: ReqAbastRow = {
  id: 6001,
  tipo: 'Veicular Abastecimento',
  data: '2026-07-20',
  status: 'financeiro',
  veiculo: '42',
  hodometro: '12.500 km',
  litros_combustivel: '48,5',
  valor_despeza: '291,00',
  fornecedor: 'POSTO TRIANGULO',
  solicitante: 'JOSE GARROTE',
  setor: 'Oficina',
  empresa: 'Nova Tratores',
  Chassis_Modelo: null,
  ordem_servico: null,
};

const mapa = new Map([['42', { placa: 'SEC1F03', modelo: 'VOYAGE' }]]);

describe('parseValorMisto — BR e US misturados (regra do parseValorReq)', () => {
  it('formato BR', () => {
    expect(parseValorMisto('1.304,60')).toBe(1304.6);
    expect(parseValorMisto('R$ 85,00')).toBe(85);
    expect(parseValorMisto('150,5')).toBe(150.5);
  });
  it('formato US / inteiro', () => {
    expect(parseValorMisto('1304.60')).toBe(1304.6);
    expect(parseValorMisto('150')).toBe(150);
  });
  it('lixo vira null (não 0 — 0 seria "de graça")', () => {
    expect(parseValorMisto('')).toBeNull();
    expect(parseValorMisto('abc')).toBeNull();
    expect(parseValorMisto(null)).toBeNull();
  });
});

describe('parseHodometroReq — só dígitos, faixa plausível (regra da tela Custos)', () => {
  it('formatos reais', () => {
    expect(parseHodometroReq('353.602')).toBe(353602);
    expect(parseHodometroReq('436473')).toBe(436473);
    expect(parseHodometroReq('12.500 km')).toBe(12500);
  });
  it('fora da faixa é erro de digitação', () => {
    expect(parseHodometroReq('50')).toBeNull();
    expect(parseHodometroReq('99999999')).toBeNull();
    expect(parseHodometroReq('')).toBeNull();
  });
});

describe('normalizarReqAbastecimento', () => {
  it('Veicular resolve placa/modelo pelo Frota e parseia os textos', () => {
    const r = normalizarReqAbastecimento(reqBase, mapa)!;
    expect(r.placa).toBe('SEC1F03');
    expect(r.modelo_veiculo).toBe('VOYAGE');
    expect(r.litros).toBe(48.5);
    expect(r.valor_total).toBe(291);
    expect(r.valor_unitario).toBe(6);
    expect(r.hodometro).toBe(12500);
    expect(r.data_transacao).toBe('2026-07-20T12:00:00-03:00');
    expect(r.origem).toBe('requisicao');
    expect(r.motorista_nome).toBe('JOSE GARROTE');
    expect(r.posto_nome).toBe('POSTO TRIANGULO');
    expect(r.departamento).toBe('Oficina');
  });

  it('Trator/Quadri entram com pseudo-placa e chassis no modelo, sem km', () => {
    const trator = normalizarReqAbastecimento(
      { ...reqBase, tipo: 'Trator Abastecimento', veiculo: null, Chassis_Modelo: 'MF 4275 · CH 1234' },
      mapa,
    )!;
    expect(trator.placa).toBe(PLACA_TRATOR);
    expect(trator.modelo_veiculo).toBe('MF 4275 · CH 1234');
    expect(trator.hodometro).toBeNull(); // horímetro não é km

    const quadri = normalizarReqAbastecimento(
      { ...reqBase, tipo: 'Quadri Abastecimento', veiculo: null },
      mapa,
    )!;
    expect(quadri.placa).toBe(PLACA_QUADRI);
  });

  it('só conta depois de ir pro financeiro (em aberto/lixeira ficam fora)', () => {
    expect(normalizarReqAbastecimento({ ...reqBase, status: 'pedido' }, mapa)).toBeNull();
    expect(normalizarReqAbastecimento({ ...reqBase, status: 'completa' }, mapa)).toBeNull();
    expect(normalizarReqAbastecimento({ ...reqBase, status: 'aguardando' }, mapa)).toBeNull();
    expect(normalizarReqAbastecimento({ ...reqBase, status: 'lixeira' }, mapa)).toBeNull();
    expect(normalizarReqAbastecimento({ ...reqBase, status: 'Financeiro' }, mapa)).not.toBeNull();
  });

  it('sem data e sem litros+valor ficam fora', () => {
    expect(normalizarReqAbastecimento({ ...reqBase, data: null }, mapa)).toBeNull();
    expect(
      normalizarReqAbastecimento({ ...reqBase, litros_combustivel: '', valor_despeza: 'a definir' }, mapa),
    ).toBeNull();
  });

  it('litros sem valor ainda entra (financeiro sem valor preenchido)', () => {
    const r = normalizarReqAbastecimento({ ...reqBase, valor_despeza: '' }, mapa)!;
    expect(r.litros).toBe(48.5);
    expect(r.valor_total).toBeNull();
    expect(r.valor_unitario).toBeNull();
  });

  it('veículo sem par no Frota não inventa placa', () => {
    const r = normalizarReqAbastecimento({ ...reqBase, veiculo: '999' }, mapa)!;
    expect(r.placa).toBe('(sem placa)');
  });
});

describe('agregações — requisição fica fora do que depende da hora real', () => {
  const cartao: LinhaDash = {
    placa: 'SEC1F03', id_placa: null, modelo_veiculo: 'VOYAGE', filial_nome: null,
    motorista_nome: null, posto_nome: null, posto_cidade: null, combustivel: 'Etanol',
    litros: 30, valor_total: 120, hodometro: null, data_transacao: '2026-07-20T08:00:00-03:00',
    capacidade_tanque: 50, ordem_servico: null, departamento: null, origem: 'cartao',
  };
  const req: LinhaDash = {
    ...cartao, litros: 48.5, valor_total: 291, combustivel: null,
    data_transacao: '2026-07-20T12:00:00-03:00', origem: 'requisicao',
  };

  it('intervalos: não gera "menos de 6h" falso com a requisição do mesmo dia', () => {
    expect(intervalosAbastecimento([cartao, req])).toHaveLength(0);
  });

  it('heatmap: requisição não infla a célula do meio-dia', () => {
    const celulas = heatmapDiaHora([cartao, req]);
    expect(celulas.reduce((s, c) => s + c.qtd, 0)).toBe(1);
  });
});
