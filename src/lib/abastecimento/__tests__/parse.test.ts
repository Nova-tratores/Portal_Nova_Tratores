import { describe, it, expect } from 'vitest';
import { normalizarPlaca, parseCsvAbastecimento, parseDataBR, parseNumeroBR, splitCsv } from '../parse';
import { consumoPorVeiculo, porCombustivel, type LinhaDash } from '../agregacoes';

// Cabeçalho + linhas REAIS do relatório da operadora (CPFs/valores do arquivo exemplo).
const CABECALHO =
  'Contrato;CNPJ Filial;Nome Filial;Base;Perfil de uso;Placa;Modelo veículo;Nome Veículo;Tipo de Frota;Capacidade Tanque;Centro de custo veículo;Descrição Centro de custo placa;Estado veículo;Cidade veículo;Patrimônio;Garagem;CPF Motorista;Nome motorista;Matrícula Motorista;RG Motorista;Número CNH;Categoria CNH;Centro de Custo Motorista;Descrição Centro de Custo Motorista;Data/ Hora transação;Data postagem;N° autorização;Nota fiscal;Tipo de cartão;Número Cartão;Limite Cartão;Saldo Cartão;CNPJ EC;Nome EC;Bandeira EC;Logradouro EC;UF EC;Cidade EC;Tipo Mercadoria;Mercadoria;Qtd Mercadoria;Valor Unit. Mercadoria;Valor total original;Valor total com desconto;Valor total Economizado;Hodômetro Anterior - Dig. Motorista;Hodômetro Transação - Dig. Motorista;Horímetro Anterior - Dig. Motorista;Horímetro Transação - Dig. Motorista;Rendimento Médio;Km/Hr Percorrido;Custo Km/Hr Percorrido;Média Efetiva (Km/Hr);Tolerância Rendimento Veículo (%);Desvio na Transação (%);Desvio na Transação (número);Descrição Desvio na Transação;Centro Custo Transação;Código Frota - Dig.Motorista;Placa - Dig.Motorista;Ordem Serviço - Dig.Motorista';

const LINHA_NORMAL =
  '14882725;23.268.241/0001-11;CASTRO PECAS E MAQUINAS AGRICOLAS LTDA;FROTA CASTRO;FROTA LEVE;SEC1F03;VOYAGE;VOYAGE H;Própria;60;COMERCIAL;COMERCIAL;;;;;796.644.158-04;PEDRO FAVARO;;;;;;;01/06/2026 07:53:33;03/06/2026;485919;8335988;Veículo;5067 50XX XXXX 7015;1.700,00;901,16;66.037.086/0001-35;AUTO POSTO 2001;POSTOS SHELL;Rua AV SAO SEBASTIAO, S/N;SP;Piraju;Combustível;Gasolina Comum;11,64;6,69;77,91;77,91;0,00;69910;70099;;;10,00;189,00;0,41;16,24;30,00;-62,37;-3,24;Desvio Acima;;;1003;';

const LINHA_SEM_MOTORISTA =
  '14882725;23.268.241/0001-11;CASTRO PECAS E MAQUINAS AGRICOLAS LTDA;FROTA CASTRO;FROTA LEVE;TKB8I49;POLO;POLO;Própria;50;DIRETORIA;DIRETORIA;;;;;;Veículo sem motorista associado;;;;;;;09/06/2026 08:44:00;11/06/2026;970870;8335988;Veículo;5067 50XX XXXX 6014;3.000,00;2.966,98;66.037.086/0001-35;AUTO POSTO 2001;POSTOS SHELL;Rua AV SAO SEBASTIAO, S/N;SP;Piraju;Combustível;Etanol;8,27;3,99;33,02;33,02;0,00;;20812;;;10,00;0,00;0,00;0,00;30,00;0,00;7,00;Desvio Abaixo;;;8149;';

describe('parseNumeroBR', () => {
  it('converte formato BR', () => {
    expect(parseNumeroBR('1.542,17')).toBe(1542.17);
    expect(parseNumeroBR('-2.456,00')).toBe(-2456);
    expect(parseNumeroBR('0,00')).toBe(0);
    expect(parseNumeroBR('')).toBeNull();
    expect(parseNumeroBR('abc')).toBeNull();
  });
});

describe('parseDataBR', () => {
  it('data+hora com offset fixo -03:00', () => {
    expect(parseDataBR('01/06/2026 07:53:33')).toBe('2026-06-01T07:53:33-03:00');
    expect(parseDataBR('03/06/2026')).toBe('2026-06-03T00:00:00-03:00');
    expect(parseDataBR('99/99/2026')).toBeNull();
    expect(parseDataBR('')).toBeNull();
  });
});

describe('normalizarPlaca', () => {
  it('maiúscula, sem hífen/espaço', () => {
    expect(normalizarPlaca('sec-1f03 ')).toBe('SEC1F03');
    expect(normalizarPlaca('ABC–1234')).toBe('ABC1234'); // en-dash do NumPlaca
  });
});

describe('splitCsv', () => {
  it('trata campo entre aspas com ; e aspas escapadas', () => {
    expect(splitCsv('a;"b;c";"d""e"\nf;;')).toEqual([['a', 'b;c', 'd"e'], ['f', '', '']]);
  });
});

describe('parseCsvAbastecimento', () => {
  it('parseia as linhas reais do relatório', () => {
    const r = parseCsvAbastecimento([CABECALHO, LINHA_NORMAL, LINHA_SEM_MOTORISTA].join('\n'));
    expect(r.erros).toHaveLength(0);
    expect(r.linhas).toHaveLength(2);
    const l = r.linhas[0];
    expect(l.placa).toBe('SEC1F03');
    expect(l.data_transacao).toBe('2026-06-01T07:53:33-03:00');
    expect(l.litros).toBe(11.64);
    expect(l.valor_unitario).toBe(6.69);
    expect(l.valor_total).toBe(77.91);
    expect(l.combustivel).toBe('Gasolina Comum');
    expect(l.motorista_nome).toBe('PEDRO FAVARO');
    expect(l.posto_nome).toBe('AUTO POSTO 2001');
    expect(l.posto_cidade).toBe('Piraju');
    expect(l.filial_nome).toBe('CASTRO PECAS E MAQUINAS AGRICOLAS LTDA');
    expect(l.hodometro_anterior).toBe(69910);
    expect(l.hodometro).toBe(70099);
    expect(l.desvio_descricao).toBe('Desvio Acima');
  });

  it('"Veículo sem motorista associado" vira motorista null (hodômetro anterior vazio ok)', () => {
    const r = parseCsvAbastecimento([CABECALHO, LINHA_SEM_MOTORISTA].join('\n'));
    expect(r.linhas[0].motorista_nome).toBeNull();
    expect(r.linhas[0].hodometro_anterior).toBeNull();
    expect(r.linhas[0].hodometro).toBe(20812);
  });

  it('deduplica linha repetida dentro do arquivo', () => {
    const r = parseCsvAbastecimento([CABECALHO, LINHA_NORMAL, LINHA_NORMAL].join('\n'));
    expect(r.linhas).toHaveLength(1);
    expect(r.duplicadasArquivo).toBe(1);
  });

  it('linha com litros inválidos vira erro (sem abortar o resto)', () => {
    const quebrada = LINHA_NORMAL.replace(';11,64;', ';;');
    const r = parseCsvAbastecimento([CABECALHO, quebrada, LINHA_SEM_MOTORISTA].join('\n'));
    expect(r.linhas).toHaveLength(1);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].motivo).toMatch(/litros/i);
  });

  it('rejeita arquivo sem as colunas obrigatórias', () => {
    expect(() => parseCsvAbastecimento('Foo;Bar\n1;2')).toThrow(/obrigatórias/);
  });
});

// ---------------------------------------------------------------------------

const dash = (over: Partial<LinhaDash>): LinhaDash => ({
  placa: 'AAA1111',
  id_placa: null,
  modelo_veiculo: 'SAVEIRO',
  filial_nome: null,
  motorista_nome: null,
  posto_nome: null,
  posto_cidade: null,
  combustivel: 'Gasolina Comum',
  litros: 40,
  valor_total: 240,
  hodometro: null,
  data_transacao: '2026-06-01T08:00:00-03:00',
  ...over,
});

describe('consumoPorVeiculo', () => {
  it('calcula km/l entre marcos e descarta delta negativo/absurdo', () => {
    const linhas: LinhaDash[] = [
      dash({ hodometro: 1000, litros: 10, data_transacao: '2026-06-01T08:00:00-03:00' }),
      dash({ hodometro: 1400, litros: 40, data_transacao: '2026-06-05T08:00:00-03:00' }), // trecho válido: 400 km / 40 L
      dash({ hodometro: 900, litros: 30, data_transacao: '2026-06-10T08:00:00-03:00' }), // delta negativo → descarta
      dash({ hodometro: 99999, litros: 30, data_transacao: '2026-06-15T08:00:00-03:00' }), // delta > 5000 → descarta
    ];
    const [c] = consumoPorVeiculo(linhas);
    expect(c.kmRodado).toBe(400);
    expect(c.litrosConsiderados).toBe(40);
    expect(c.kmPorLitro).toBe(10);
    expect(c.trechos).toBe(1);
    expect(c.trechosDescartados).toBe(2);
  });

  it('abastecimento sem hodômetro no meio entra nos litros do trecho', () => {
    const linhas: LinhaDash[] = [
      dash({ hodometro: 1000, litros: 10, data_transacao: '2026-06-01T08:00:00-03:00' }),
      dash({ hodometro: null, litros: 20, data_transacao: '2026-06-03T08:00:00-03:00' }),
      dash({ hodometro: 1300, litros: 10, data_transacao: '2026-06-05T08:00:00-03:00' }),
    ];
    const [c] = consumoPorVeiculo(linhas);
    expect(c.kmRodado).toBe(300);
    expect(c.litrosConsiderados).toBe(30); // 20 (sem marco) + 10 (marco B)
    expect(c.kmPorLitro).toBe(10);
  });

  it('exclui as placas especiais de clientes/tratores', () => {
    const linhas: LinhaDash[] = [
      dash({ placa: 'CLI0002', hodometro: 100 }),
      dash({ placa: 'CLI0002', hodometro: 200, data_transacao: '2026-06-05T08:00:00-03:00' }),
    ];
    expect(consumoPorVeiculo(linhas)).toHaveLength(0);
  });
});

describe('porCombustivel', () => {
  it('preço médio = valor / litros', () => {
    const linhas: LinhaDash[] = [
      dash({ combustivel: 'Etanol', litros: 40, valor_total: 160 }),
      dash({ combustivel: 'Etanol', litros: 60, valor_total: 240 }),
    ];
    const [c] = porCombustivel(linhas);
    expect(c.litros).toBe(100);
    expect(c.valor).toBe(400);
    expect(c.precoMedio).toBe(4);
  });
});
