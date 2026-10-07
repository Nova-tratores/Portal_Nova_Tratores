import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  normCod, variantesCodigo, dataVendaPedido, somarVendasDoMes, avisosGeracao,
  preencherCabecalho, preencherTemplate, contarPecasTemplate,
  type PedidoVenda, type VendasDoMes,
} from '../mahindra-preencher';

const ETAPAS = new Set(['60', '70']);

/** Monta um template minimo no formato do arquivo da Mahindra. */
function template(codigos: string[], cabecalho: { concessionaria?: any; mesAno?: any } = {}): Buffer {
  const aoa: any[][] = [
    ['INFORMATIVO ESTOQUE E VENDA DE PEÇAS'],
    ['Concessionária:', cabecalho.concessionaria ?? ''],
    ['Responsável :', 'Zézo'],
    ['MÊS/ANO', cabecalho.mesAno ?? ''],
    [],
    ['CÓDIGO DA PEÇA', 'DESCRIÇÃO', 'QUANTIDADE DO ESTOQUE', 'QUANTIDADE VENDIDA'],
    ...codigos.map((c) => [c, 'peca ' + c, '', '']),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Estoque e Venda');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Le de volta { codigo: [estoque, vendida] } + o cabecalho. */
function ler(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const linhas = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const pecas = linhas.slice(6).map((l) => ({ codigo: l[0], est: l[2], ven: l[3] }));
  return { concessionaria: linhas[1][1], responsavel: linhas[2][1], mesAno: linhas[3][1], pecas };
}

const semVendas = (): VendasDoMes => ({
  vendaPorCod: new Map(), pedidosConsiderados: 0, pedidosCancelados: 0, pedidosForaEtapa: 0, pedidosForaDoMes: 0,
});

const base = {
  mes: '2026-07', contaLabel: 'NOVA', etapasVenda: ['60', '70'],
  dataInicioBR: '01/07/2026', dataFimBR: '31/07/2026', hoje: new Date(2026, 9, 1),
};

describe('variantesCodigo', () => {
  it('devolve a grafia exata primeiro e depois a outra', () => {
    expect(variantesCodigo('RP-0734309419')).toEqual(['RP-0734309419', '0734309419']);
    expect(variantesCodigo('0734309419')).toEqual(['0734309419', 'RP-0734309419']);
  });
  it('codigo que e so o prefixo nao gera variante vazia', () => {
    expect(variantesCodigo('RP-')).toEqual(['RP-']);
    expect(variantesCodigo('')).toEqual([]);
  });
  it('normCod tira espacos e sobe a caixa', () => {
    expect(normCod('  rp-006 034348u1 ')).toBe('RP-006034348U1');
  });
});

describe('dataVendaPedido', () => {
  it('usa o faturamento; sem ele a previsao; sem ela a inclusao', () => {
    expect(dataVendaPedido({ dataFaturamento: '03/08/2026', dataPrevisao: '28/07/2026', dataInclusao: '28/07/2026' })).toBe('2026-08-03');
    expect(dataVendaPedido({ dataPrevisao: '28/07/2026', dataInclusao: '20/07/2026' })).toBe('2026-07-28');
    expect(dataVendaPedido({ dataInclusao: '20/07/2026' })).toBe('2026-07-20');
    expect(dataVendaPedido({})).toBeNull();
  });
});

describe('somarVendasDoMes', () => {
  // casos reais da auditoria: 7442 incluido em 28/07 e faturado em 03/08;
  // 7291 incluido em 22/06 e faturado em 10/07
  const p7442: PedidoVenda = { etapa: '60', dataInclusao: '28/07/2026', dataPrevisao: '28/07/2026', dataFaturamento: '03/08/2026', itens: [{ codigo: 'RP-000061276M01', qtde: 6 }] };
  const p7291: PedidoVenda = { etapa: '60', dataInclusao: '22/06/2026', dataPrevisao: '10/07/2026', dataFaturamento: '10/07/2026', itens: [{ codigo: 'RP-006511388B1', qtde: 4 }] };
  const pedidos: PedidoVenda[] = [
    p7442, p7291,
    { etapa: '60', dataFaturamento: '15/07/2026', itens: [{ codigo: 'rp-006511388b1', qtde: 1 }, { codigo: null, qtde: 9 }] },
    { etapa: '60', cancelada: true, dataFaturamento: '06/07/2026', itens: [{ codigo: 'RP-X', qtde: 5 }] },
    { etapa: '50', dataPrevisao: '21/07/2026', itens: [{ codigo: 'RP-X', qtde: 5 }] },
  ];

  it('conta o pedido no mes em que foi FATURADO, nao no que foi incluido', () => {
    const jul = somarVendasDoMes(pedidos, '2026-07', ETAPAS);
    expect(jul.vendaPorCod.get('RP-006511388B1')).toBe(5);       // 7291 + o de 15/07
    expect(jul.vendaPorCod.has('RP-000061276M01')).toBe(false);  // 7442 e de agosto
    expect(jul.pedidosConsiderados).toBe(2);
    expect(jul.pedidosCancelados).toBe(1);
    expect(jul.pedidosForaEtapa).toBe(1);
    expect(jul.pedidosForaDoMes).toBe(1);
  });

  it('cada pedido cai em exatamente um mes (sem dupla contagem entre arquivos)', () => {
    const total = (mes: string) => [...somarVendasDoMes(pedidos, mes, ETAPAS).vendaPorCod.values()].reduce((a, b) => a + b, 0);
    expect(total('2026-06')).toBe(0);   // 7291 NAO conta em junho
    expect(total('2026-07')).toBe(5);
    expect(total('2026-08')).toBe(6);   // 7442 so em agosto
  });

  it('pedido sem data nenhuma fica de fora', () => {
    const r = somarVendasDoMes([{ etapa: '60', itens: [{ codigo: 'A', qtde: 1 }] }], '2026-07', ETAPAS);
    expect(r.pedidosConsiderados).toBe(0);
    expect(r.pedidosForaDoMes).toBe(1);
  });
});

describe('avisosGeracao', () => {
  it('avisa quando o mes ainda nao terminou (inclusive no ultimo dia)', () => {
    expect(avisosGeracao('2026-08', new Date(2026, 7, 31, 17, 0))[0]).toMatch(/ainda não terminou/);
  });
  it('avisa nos primeiros dias depois do fechamento', () => {
    expect(avisosGeracao('2026-06', new Date(2026, 6, 1))[0]).toMatch(/1 dia\(s\) depois do fechamento/);
    expect(avisosGeracao('2026-06', new Date(2026, 6, 5))).toHaveLength(1);
  });
  it('fica quieto depois da folga', () => {
    expect(avisosGeracao('2026-06', new Date(2026, 6, 6))).toEqual([]);
    expect(avisosGeracao('2026-06', new Date(2026, 7, 4))).toEqual([]);
    expect(avisosGeracao('lixo', new Date())).toEqual([]);
  });
});

describe('preencherCabecalho', () => {
  const folha = (aoa: any[][]) => XLSX.utils.aoa_to_sheet(aoa);

  it('regrava o mes e a conta que vieram de outra geracao', () => {
    const sh = folha([['Concessionária:', 'NOVA'], ['MÊS/ANO', '06/2026']]);
    preencherCabecalho(sh, { concessionaria: 'CASTRO', mesAno: '07/2026' });
    expect(sh.B1.v).toBe('CASTRO');
    expect(sh.B2.v).toBe('07/2026');
  });
  it('preenche quando esta vazio e regrava quando o Excel virou o mes em data', () => {
    const sh = folha([['Concessionária:'], ['MÊS/ANO', new Date(2026, 5, 1)]]);
    preencherCabecalho(sh, { concessionaria: 'NOVA', mesAno: '07/2026' });
    expect(sh.B1.v).toBe('NOVA');
    expect(sh.B2.v).toBe('07/2026');
  });
  it('nao apaga texto livre ao lado do rotulo nem mexe em vizinho de texto longo', () => {
    const sh = folha([
      ['Concessionária:', 'Nova Tratores Piraju'],
      ['Informe o MÊS/ANO de referência no campo indicado abaixo', '06/2026'],
    ]);
    preencherCabecalho(sh, { concessionaria: 'NOVA', mesAno: '07/2026' });
    expect(sh.B1.v).toBe('Nova Tratores Piraju');
    expect(sh.B2.v).toBe('06/2026');
  });
});

describe('preencherTemplate', () => {
  it('preenche estoque e venda, zera negativo e deixa em branco o que nao existe', () => {
    const vendas = semVendas();
    vendas.vendaPorCod.set('RP-A', 3);
    vendas.vendaPorCod.set('RP-NEG', 2);
    const r = preencherTemplate({
      ...base, vendas,
      templateBuffer: template(['RP-A', 'RP-NEG', 'RP-NAOTEM', '.']),
      estoquePorCod: new Map([['RP-A', { saldo: 7 }], ['RP-NEG', { saldo: -4 }]]),
    });
    const { pecas } = ler(r.buffer);
    expect(pecas[0]).toMatchObject({ codigo: 'RP-A', est: 7, ven: 3 });
    expect(pecas[1]).toMatchObject({ codigo: 'RP-NEG', est: 0, ven: 2 });
    expect(pecas[2]).toMatchObject({ codigo: 'RP-NAOTEM', est: '', ven: '' });
    expect(r.resumo.totalPecas).toBe(3);                 // o "." solto nao e peca
    expect(r.resumo.encontradas).toBe(2);
    expect(r.resumo.naoEncontrados).toEqual(['RP-NAOTEM']);
    expect(r.resumo.negativos).toEqual([{ codigo: 'RP-NEG', saldo: -4 }]);
    expect(r.resumo.vendaSemEstoque).toEqual([{ codigo: 'RP-NEG', vendida: 2 }]);
    expect(r.resumo.somaEstoque).toBe(7);
    expect(r.resumo.somaVendida).toBe(5);
    expect(r.filename).toBe('Estoque_Venda_Mahindra_NOVA_2026-07.xlsx');
  });

  it('casa o codigo cadastrado na Omie sem o "RP-" e soma as duas grafias', () => {
    const vendas = semVendas();
    vendas.vendaPorCod.set('0734309419', 5);              // vendido pelo SKU sem prefixo
    const r = preencherTemplate({
      ...base, vendas,
      templateBuffer: template(['RP-0734309419', 'RP-4472336288', 'SEMPREFIXO']),
      estoquePorCod: new Map([
        ['0734309419', { saldo: 1 }],
        ['RP-4472336288', { saldo: 0 }], ['4472336288', { saldo: 5 }],   // cadastrado dos dois jeitos
        ['RP-SEMPREFIXO', { saldo: 2 }],
      ]),
    });
    const { pecas } = ler(r.buffer);
    expect(pecas[0]).toMatchObject({ est: 1, ven: 5 });
    expect(pecas[1]).toMatchObject({ est: 5, ven: 0 });
    expect(pecas[2]).toMatchObject({ est: 2, ven: 0 });
    expect(r.resumo.naoEncontrados).toEqual([]);
    expect(r.resumo.casadosSemPrefixo).toEqual([
      { codigo: 'RP-0734309419', sku: '0734309419' },
      { codigo: 'RP-4472336288', sku: '4472336288' },
      { codigo: 'SEMPREFIXO', sku: 'RP-SEMPREFIXO' },
    ]);
  });

  it('linha repetida recebe o mesmo valor, mas nao dobra as somas', () => {
    const vendas = semVendas();
    vendas.vendaPorCod.set('RP-DUP', 1);
    const r = preencherTemplate({
      ...base, vendas,
      templateBuffer: template(['RP-DUP', 'RP-OUTRA', 'RP-DUP', 'RP-NADA', 'RP-NADA']),
      estoquePorCod: new Map([['RP-DUP', { saldo: 2 }], ['RP-OUTRA', { saldo: 3 }]]),
    });
    const { pecas } = ler(r.buffer);
    expect(pecas[0]).toMatchObject({ est: 2, ven: 1 });
    expect(pecas[2]).toMatchObject({ est: 2, ven: 1 });
    expect(r.resumo.somaEstoque).toBe(5);
    expect(r.resumo.somaVendida).toBe(1);
    expect(r.resumo.codigosRepetidos).toEqual(['RP-DUP', 'RP-NADA']);
    expect(r.resumo.naoEncontrados).toEqual(['RP-NADA']);
    expect(r.resumo.encontradas).toBe(3);
  });

  it('cabecalho sai com o mes da geracao mesmo em template ja preenchido', () => {
    const r = preencherTemplate({
      ...base, vendas: semVendas(),
      templateBuffer: template(['RP-A'], { concessionaria: 'NOVA', mesAno: '06/2026' }),
      estoquePorCod: new Map([['RP-A', { saldo: 1 }]]),
    });
    const lido = ler(r.buffer);
    expect(lido.mesAno).toBe('07/2026');
    expect(lido.concessionaria).toBe('NOVA');
    expect(lido.responsavel).toBe('Zézo');
  });

  it('leva pro resumo os contadores de pedido, o criterio e os avisos', () => {
    const vendas: VendasDoMes = { vendaPorCod: new Map(), pedidosConsiderados: 90, pedidosCancelados: 20, pedidosForaEtapa: 12, pedidosForaDoMes: 31 };
    const r = preencherTemplate({
      ...base, vendas, hoje: new Date(2026, 7, 2),
      templateBuffer: template(['RP-A']), estoquePorCod: new Map([['RP-A', { saldo: 1 }]]),
    });
    expect(r.resumo).toMatchObject({ pedidosConsiderados: 90, pedidosCancelados: 20, pedidosForaEtapa: 12, pedidosForaDoMes: 31, criterioVenda: 'faturamento' });
    expect(r.resumo.avisos).toHaveLength(1);
  });

  it('recusa template sem tabela de pecas e mes invalido', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['nada', 'aqui']]), 'x');
    const ruim = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(() => contarPecasTemplate(ruim)).toThrow(/nao encontrei a tabela/);
    expect(() => preencherTemplate({ ...base, mes: '07/2026', vendas: semVendas(), templateBuffer: template(['A']), estoquePorCod: new Map() })).toThrow(/mes de referencia invalido/);
    expect(contarPecasTemplate(template(['A', 'B', '.']))).toBe(2);
  });
});
