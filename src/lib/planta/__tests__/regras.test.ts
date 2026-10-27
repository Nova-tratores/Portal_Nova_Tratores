import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcularKpis, frescor, prepararParaUsuario, filtrarConta, isoDe, itensDoKpi, CATALOGO, doSnapshot, linhaOmie, itemPedidoOmie, itemRemessaOmie, semItens, porCriador, type Fontes, type LinhaKpi } from '../regras';

const HOJE = '2026-10-19';
function fontes(p: Partial<Fontes> = {}): Fontes {
  return { hoje: HOJE, agora: Date.parse(HOJE + 'T15:00:00Z'), pagar: [], receber: [], fila: [], propostas: [], zap: [], revisoesPendentes: [], garantias: [], criadoresOS: {}, pedidosFabrica: [], nfMaquinas: [], pedidos: [], os: [], metricasAbertas: [], requisicoes: [], alocacao: [], negativos: [], robos: {}, falhas: {}, ...p };
}
const k = (ls: LinhaKpi[], id: string, conta = 'TODAS') => ls.find((l) => l.kpi_id === id && l.conta === conta)!;
const tit = (o: Record<string, unknown>) => ({ codigo_lancamento: 1, conta_omie: 'NOVA', status_titulo: 'A VENCER', valor_documento: 100, valor_pago: 0, data_vencimento: HOJE, data_previsao: HOJE, ...o });

describe('financeiro (mesmas regras de /api/dre-financeiro/vencidos)', () => {
  const pagar = [
    tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-10-09', valor_documento: 300, nome_fornecedor: 'FORNECEDOR X' }),          // 10 d → 1-30
    tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-07-01', valor_documento: 500, valor_pago: 200, nome_fornecedor: 'Y' }),     // parcial: 300 em aberto, 90+
    tit({ status_titulo: 'ATRASADO', data_vencimento: '2025-12-01', valor_documento: 999, nome_fornecedor: 'Z' }),                     // ano anterior: fora
    tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-10-01', valor_documento: 777, nome_fornecedor: 'CASTRO PEÇAS LTDA' }),     // intercompany: fora
    tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-10-01', valor_documento: 888, codigo_lancamento: 2485828573, nome_fornecedor: 'W' }), // ignorado
    tit({ data_previsao: HOJE, valor_documento: 50 }),
    tit({ data_previsao: '2026-10-26', valor_documento: 70 }),   // +7 dias: entra no 7d
    tit({ data_previsao: '2026-10-27', valor_documento: 90 }),   // +8: fora do 7d
    tit({ status_titulo: 'PAGO', data_previsao: HOJE, valor_documento: 1000 }),
    tit({ conta_omie: 'castro', status_titulo: 'ATRASADO', data_vencimento: '2026-10-18', valor_documento: 40, nome_fornecedor: 'K' }),
  ];
  // vencido tem previsão = vencimento (não cai em "hoje")
  for (const t of pagar) if (t.status_titulo === 'ATRASADO') t.data_previsao = t.data_vencimento;
  const ls = calcularKpis(fontes({ pagar }));
  it('vencido: só do ano, sem intercompany e sem ignorados; aberto = documento − pago', () => {
    const v = k(ls, 'pagar_vencido', 'NOVA');
    expect(v.contagem).toBe(2);
    expect(v.valor).toBe(600);
    expect(v.detalhe.aging).toEqual({ '1-30': 300, '31-60': 0, '61-90': 0, '90+': 300 });
    expect(v.detalhe.antes_do_ano).toEqual({ contagem: 1, valor: 999 });
  });
  it('hoje e 7 dias pela data de previsão, sem título pago', () => {
    expect(k(ls, 'pagar_hoje', 'NOVA')).toMatchObject({ contagem: 1, valor: 50 });
    expect(k(ls, 'pagar_7d', 'NOVA')).toMatchObject({ contagem: 1, valor: 70 });
  });
  it('conta em minúscula é reconhecida e TODAS soma as duas', () => {
    expect(k(ls, 'pagar_vencido', 'CASTRO').valor).toBe(40);
    expect(k(ls, 'pagar_vencido', 'TODAS').valor).toBe(640);
    expect(k(ls, 'pagar_vencido', 'TODAS').contagem).toBe(3);
  });
  it('fluxo de 30 dias por semana (receber − pagar)', () => {
    const f = calcularKpis(fontes({ pagar: [tit({ data_previsao: '2026-10-20', valor_documento: 100 })], receber: [tit({ data_previsao: '2026-10-30', valor_documento: 250 })] }));
    const sem = k(f, 'fluxo_30d', 'NOVA').detalhe.semanas;
    expect(sem[0]).toEqual({ semana: 1, receber: 0, pagar: 100, liquido: -100 });
    expect(sem[1]).toEqual({ semana: 2, receber: 250, pagar: 0, liquido: 250 });
    expect(k(f, 'fluxo_30d', 'NOVA').valor).toBe(150);
  });
});

describe('máquinas', () => {
  it('NF faturada até 45 dias = a caminho; mais antiga = esquecida; aceita DD/MM/AAAA', () => {
    const ls = calcularKpis(fontes({ nfMaquinas: [
      { conta_omie: 'nova', emissao_nfe: '2026-09-21', qtd_maquinas: 1, valor_maquinas: 16700 },
      { conta_omie: 'nova', emissao_nfe: '28/01/2025', qtd_maquinas: 2, valor_maquinas: 8700 },
    ] }));
    expect(k(ls, 'maq_em_transito', 'NOVA')).toMatchObject({ contagem: 1, valor: 16700 });
    expect(k(ls, 'maq_receb_esquecido', 'NOVA')).toMatchObject({ contagem: 2, valor: 8700 });
    expect(k(ls, 'maq_receb_esquecido', 'NOVA').detalhe.mais_antiga).toBe('2025-01-28');
  });
  it('pedido de fábrica: antes de chegar × chegou sem faturar', () => {
    const ls = calcularKpis(fontes({ pedidosFabrica: [
      { status: 'Pedido Feito / Aguardando Maq', eta_fabrica: '2026-10-10', dias_atraso_eta: 9 },
      { status: 'Proposta Concluida/ Maquina Recebida', dias_na_fase: 59 },
      { status: 'Faturado por nós' },
    ] }));
    expect(k(ls, 'maq_pedido_fabrica')).toMatchObject({ contagem: 1, detalhe: { com_previsao: 1, atrasados: 1 } });
    expect(k(ls, 'maq_recebida_sem_faturar')).toMatchObject({ contagem: 1, detalhe: { maior_dias_na_fase: 59 } });
  });
});

describe('balcão e oficina (mesmas fases das telas)', () => {
  it('PPV: Concluída (Faturado) e Cancelada não contam; idade pela data de mudança de fase', () => {
    const ls = calcularKpis(fontes({ pedidos: [
      { status: 'Orçamento', valor_total: 100, status_desde: '2026-10-18T10:00:00Z', Tipo_Pedido: 'Pedido' },
      { status: 'Concluída', valor_total: 999, Tipo_Pedido: 'Pedido' },
      { status: 'Cancelada', valor_total: 999, Tipo_Pedido: 'Remessa' },
      { status: 'Execução', valor_total: 50, data: '01/10/2026 10:00' },
    ] }));
    expect(k(ls, 'ppv_pedido_aberto')).toMatchObject({ contagem: 2, valor: 150 });
    expect(k(ls, 'ppv_pedido_aberto').detalhe.por_idade).toEqual({ '0-2': 1, '3-7': 0, '8+': 1, 'sem data': 0 });
  });
  it('PPV: pedido e remessa em quadros separados pelo tipo; quem criou = quem lançou', () => {
    const f = fontes({ pedidos: [
      { id_pedido: 'PPV-1', status: 'Orçamento', valor_total: 10, Tipo_Pedido: 'Pedido', email_usuario: 'Vinicius Correa ' },
      { id_pedido: 'PPV-2', status: 'Aguardando', valor_total: 20, Tipo_Pedido: 'Remessa', email_usuario: 'Larissa Garcia' },
      { id_pedido: 'PPV-3', status: 'Aguardando', valor_total: 30, Tipo_Pedido: ' remessa ', email_usuario: 'Larissa Garcia' },
    ] });
    const ls = calcularKpis(f);
    expect(k(ls, 'ppv_pedido_aberto')).toMatchObject({ contagem: 1, valor: 10 });
    expect(k(ls, 'ppv_remessa_aberta')).toMatchObject({ contagem: 2, valor: 50 });
    const pedido = itensDoKpi('ppv_pedido_aberto', 'TODAS', f);
    expect(pedido.itens[0].criado_por).toBe('Vinicius Correa');
    expect(itensDoKpi('ppv_remessa_aberta', 'TODAS', f).por_criador).toEqual([['Larissa Garcia', 2]]);
  });
  it('OS: atrasada = métrica aberta com dias > 0; sem faturar soma o valor da OS', () => {
    const ls = calcularKpis(fontes({
      os: [
        { Id_Ordem: 'OS-1', Status: 'Execução', Valor_Total: '100' },
        { Id_Ordem: 'OS-2', Status: 'Cobrando Cliente', Valor_Total: '1.234,56' },
        { Id_Ordem: 'OS-3', Status: 'Concluída', Valor_Total: '999' },
      ],
      metricasAbertas: [{ id_ordem: 'OS-1', dias: 3 }, { id_ordem: 'OS-2', dias: 0 }],
    }));
    expect(k(ls, 'os_por_fase')).toMatchObject({ contagem: 2, detalhe: { por_fase: { 'Execução': 1, 'Cobrando Cliente': 1 } } });
    expect(k(ls, 'os_atrasada')).toMatchObject({ contagem: 1, detalhe: { maior_atraso_dias: 3 } });
    expect(k(ls, 'os_sem_faturar').contagem).toBe(1);
    expect(k(ls, 'os_sem_faturar').valor).toBeCloseTo(1234.56, 2);
  });
});

describe('falha de um cômodo não derruba os outros', () => {
  it('cômodo com falha volta com erro em todos os seus números', () => {
    const ls = calcularKpis(fontes({ falhas: { oficina: 'Ordem_Servico: timeout', balcao: 'pedidos: timeout' }, alocacao: [{ conta_omie: 'NOVA' }] }));
    expect(k(ls, 'os_por_fase').erro).toBe('Ordem_Servico: timeout');
    expect(ls.some((l) => l.kpi_id === 'pv_omie_aberto')).toBe(false); // erro do espelho não marca o número da Omie
    expect(k(ls, 'pecas_a_alocar', 'NOVA')).toMatchObject({ contagem: 1, erro: null });
  });
  it('todo número do catálogo sai em toda rodada', () => {
    const ids = new Set(calcularKpis(fontes()).map((l) => l.kpi_id));
    expect([...ids].sort()).toEqual(Object.keys(CATALOGO).filter(doSnapshot).sort());
  });
});

describe('leitura pela rota', () => {
  const ls = calcularKpis(fontes({ pagar: [tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-10-10', valor_documento: 300, nome_fornecedor: 'X' })] }))
    .map((l) => ({ ...l, dado_ate: '2026-10-19T12:00:00Z', calculado_em: '2026-10-19T12:00:00Z' }));
  const agora = new Date('2026-10-19T12:30:00Z').getTime();
  it('não admin: financeiro lacrado, sem valor e sem detalhe; contagem fica', () => {
    const v = prepararParaUsuario(ls, false, agora).find((x) => x.kpi_id === 'pagar_vencido' && x.conta === 'NOVA')!;
    expect(v).toMatchObject({ lacrado: true, valor: null, detalhe: {}, contagem: 1 });
  });
  it('admin vê o valor', () => {
    const v = prepararParaUsuario(ls, true, agora).find((x) => x.kpi_id === 'pagar_vencido' && x.conta === 'NOVA')!;
    expect(v).toMatchObject({ lacrado: false, valor: 300 });
  });
  it('filtrarConta: KPI por conta pega a conta; KPI sem conta pega TODAS', () => {
    const f = filtrarConta(ls, 'NOVA');
    expect(f.find((x) => x.kpi_id === 'pagar_vencido')!.conta).toBe('NOVA');
    expect(f.find((x) => x.kpi_id === 'ppv_pedido_aberto')!.conta).toBe('TODAS');
    expect(f.filter((x) => x.kpi_id === 'pagar_vencido')).toHaveLength(1);
  });
});

describe('detalhe = os mesmos registros do número', () => {
  const f = fontes({
    pagar: [
      tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-10-10', data_previsao: '2026-10-10', valor_documento: 300, nome_fornecedor: 'A' }),
      tit({ status_titulo: 'ATRASADO', data_vencimento: '2026-09-01', data_previsao: '2026-09-01', valor_documento: 500, valor_pago: 100, nome_fornecedor: 'B' }),
      tit({ conta_omie: 'CASTRO', status_titulo: 'ATRASADO', data_vencimento: '2026-10-01', data_previsao: '2026-10-01', valor_documento: 70, nome_fornecedor: 'C' }),
      tit({ data_previsao: '2026-10-22', valor_documento: 90 }),
    ],
    receber: [tit({ data_previsao: '2026-10-25', valor_documento: 1000, nome_cliente: 'Z' })],
    pedidos: [{ id_pedido: 'PPV-1', status: 'Orçamento', valor_total: 10, cliente: 'X' }, { id_pedido: 'PPV-2', status: 'Concluída', valor_total: 99 }],
    os: [{ Id_Ordem: 'OS-1', Status: 'Cobrando Cliente', Valor_Total: '200', Os_Cliente: 'Y' }],
    alocacao: [{ id: 1, conta_omie: 'NOVA', codigo: 'P1', descricao: 'Filtro' }],
  });
  const ls = calcularKpis(f);
  for (const [kpi, conta] of [['pagar_vencido', 'NOVA'], ['pagar_vencido', 'TODAS'], ['pagar_7d', 'NOVA'], ['ppv_pedido_aberto', 'TODAS'], ['os_sem_faturar', 'TODAS'], ['pecas_a_alocar', 'NOVA']] as const) {
    it(`${kpi} ${conta}: quantidade e soma da lista = o número`, () => {
      const n = k(ls, kpi, conta);
      const { itens, total } = itensDoKpi(kpi, conta, f);
      expect(total).toBe(n.contagem);
      if (n.valor != null) expect(itens.reduce((s, i) => s + (i.valor || 0), 0)).toBeCloseTo(n.valor, 2);
    });
  }
  it('fluxo: a lista soma a saída líquida (pagar entra negativo)', () => {
    const n = k(ls, 'fluxo_30d', 'NOVA');
    const { itens } = itensDoKpi('fluxo_30d', 'NOVA', f);
    expect(itens.reduce((s, i) => s + (i.valor || 0), 0)).toBeCloseTo(n.valor!, 2);
  });
  it('vencidos saem do mais antigo para o mais novo, com link da tela oficial', () => {
    const { itens } = itensDoKpi('pagar_vencido', 'NOVA', f);
    expect(itens.map((i) => i.titulo)).toEqual(['B', 'A']);
    expect(itens[0].href).toBe('/dre-financeiro/vencidos');
  });
  it('PPV e OS levam ao registro na tela', () => {
    expect(itensDoKpi('ppv_pedido_aberto', 'TODAS', f).itens[0].href).toBe('/ppv?id=PPV-1');
    expect(itensDoKpi('os_sem_faturar', 'TODAS', f).itens[0].href).toBe('/pos?id=OS-1');
  });
});


describe('90 dias e propostas (pedido de 22/10/2026)', () => {
  it('a pagar/receber em 90 dias: da previsão de amanhã até +90, sem hoje', () => {
    const ls = calcularKpis(fontes({ pagar: [
      tit({ data_previsao: HOJE, valor_documento: 1 }),
      tit({ data_previsao: '2026-10-20', valor_documento: 10 }),
      tit({ data_previsao: '2027-01-17', valor_documento: 100 }),   // +90
      tit({ data_previsao: '2027-01-18', valor_documento: 1000 }),  // +91: fora
    ] }));
    expect(k(ls, 'pagar_90d', 'NOVA')).toMatchObject({ contagem: 2, valor: 110 });
  });
  it('propostas em aberto: quantidade, valor, ponderado e fases; lista com link', () => {
    const f = fontes({ propostas: [
      { id: 1, Cliente: 'A', status: 'AGUARDANDO RESPOSTA CLIENTE', valor: 200000, valor_ponderado: 60000, previsao_fechamento: null, Marca: 'MAHINDRA', Modelo: '6075' },
      { id: 2, Cliente: 'B', status: 'AGUARDANDO RESPOSTA BANCO', valor: 100000, valor_ponderado: 60000, previsao_fechamento: '2026-11-10' },
    ] });
    const n = k(calcularKpis(f), 'propostas_abertas');
    expect(n).toMatchObject({ contagem: 2, valor: 300000 });
    expect(n.detalhe).toMatchObject({ ponderado: 120000, sem_previsao: 1, por_status: { 'AGUARDANDO RESPOSTA CLIENTE': 1, 'AGUARDANDO RESPOSTA BANCO': 1 } });
    const { itens, total } = itensDoKpi('propostas_abertas', 'TODAS', f);
    expect(total).toBe(2);
    expect(itens[0]).toMatchObject({ titulo: 'A', valor: 200000, href: '/propostas' });
  });
});


describe('requisições em aberto (pedido de 22/10/2026)', () => {
  const f = fontes({ requisicoes: [
    { id: 1, titulo: 'Filtro', tipo: 'Peças', status: 'pedido', valor_despeza: 'R$ 1.234,50', created_at: '2026-10-20T10:00:00Z' },
    { id: 2, titulo: 'Guincho', tipo: 'Serviço de Terceiros', status: 'AGUARDANDO', valor_despeza: '800.00', created_at: '2026-08-01T10:00:00Z' },
    { id: 3, titulo: 'Diesel', tipo: 'Veicular Abastecimento', status: 'aguardando', valor_despeza: '', created_at: '2026-10-01T10:00:00Z' },
    { id: 4, titulo: 'Paga', tipo: 'Peças', status: 'financeiro', valor_despeza: '999', created_at: '2026-10-01T10:00:00Z' },
    { id: 5, titulo: 'Apagada', tipo: 'Peças', status: 'lixeira', valor_despeza: '999', created_at: '2026-10-01T10:00:00Z' },
  ] });
  it('conta só as fases abertas do Kanban (qualquer caixa), valor BR/US com R$', () => {
    const n = k(calcularKpis(f), 'requisicoes_abertas');
    expect(n.contagem).toBe(3);
    expect(n.valor).toBeNull();
    expect(n.detalhe).toMatchObject({ valor_informado: 2034.5, com_valor: 2, paradas_30: 1, por_fase: { 'Pedido Realizado': 1, 'Aguardando Fornecedor': 2 } });
  });
  it('lista da mais antiga para a mais nova, com link para o card', () => {
    const { itens, total } = itensDoKpi('requisicoes_abertas', 'TODAS', f);
    expect(total).toBe(3);
    expect(itens.map((i) => i.chave)).toEqual(['req-2', 'req-3', 'req-1']);
    expect(itens[0].href).toBe('/requisicoes?req=2');
  });
});


describe('pós-venda e cliente (pedido de 22/10/2026)', () => {
  const f = fontes({
    zap: [
      { id: 1, cliente_nome: 'Cliente A', resumo: 'quer orçamento', ultima_msg_em: HOJE + 'T14:20:00Z', origem: 'vigia' },
      { id: 2, contato_nome: 'Contato B', created_at: HOJE + 'T10:00:00Z', origem: 'vigia_robo_desligado' },
    ],
    revisoesPendentes: [{ Id_Ordem: 'OS-0807', Os_Cliente: 'Fulano', pendencia_mahindra: { chassis: 'MDI0751', detalhes: ['Cheque de revisão 900h não enviado'] } }],
    garantias: [
      { id: 10, numero: 'G-10', cliente: 'X', status: 'enviada', enviada_fabrica_em: '2026-09-21T12:00:00Z' },
      { id: 11, numero: 'G-11', cliente: 'Y', status: 'em_analise', created_at: '2026-10-15T12:00:00Z' },
      { id: 12, numero: 'G-12', cliente: 'Z', status: 'aprovada' },
    ],
  });
  const ls = calcularKpis(f);
  it('WhatsApp: conta as conversas e mede a espera mais longa em minutos', () => {
    expect(k(ls, 'zap_sem_resposta')).toMatchObject({ contagem: 2, detalhe: { mais_antiga_min: 300, robo_desligado: 1 } });
    const { itens } = itensDoKpi('zap_sem_resposta', 'TODAS', f);
    expect(itens[0].titulo).toBe('Contato B');
    expect(itens[1].sub).toContain('esperando há 40 min');
  });
  it('cheques de revisão: OS marcada, com o motivo e link para a OS', () => {
    expect(k(ls, 'cheques_revisao_pendentes').contagem).toBe(1);
    expect(itensDoKpi('cheques_revisao_pendentes', 'TODAS', f).itens[0]).toMatchObject({ href: '/pos?id=OS-0807' });
  });
  it('garantias: só as não finalizadas; quantas esperam a fábrica e há quanto tempo', () => {
    expect(k(ls, 'garantias_abertas')).toMatchObject({ contagem: 2, detalhe: { esperando_fabrica: 1, mais_antiga_dias: 28 } });
    expect(itensDoKpi('garantias_abertas', 'TODAS', f).itens[0].sub).toContain('na fábrica há 28 d');
  });
});

describe('frescor', () => {
  it('verde até 2× o intervalo esperado, amarelo até 4×, vermelho depois ou sem data', () => {
    expect(frescor(300, 'contas')).toBe('verde');      // 5 h, esperado 3 h
    expect(frescor(600, 'contas')).toBe('amarelo');    // 10 h
    expect(frescor(800, 'contas')).toBe('vermelho');
    expect(frescor(15, 'recebimentos')).toBe('verde');
    expect(frescor(null, 'nativo')).toBe('vermelho');
  });
  it('isoDe aceita os dois formatos', () => {
    expect(isoDe('28/01/2025')).toBe('2025-01-28');
    expect(isoDe('2026-09-21T00:00:00')).toBe('2026-09-21');
  });
});

describe('quem criou e Omie (pedido de 27/10/2026)', () => {
  const f = fontes({
    os: [{ Id_Ordem: 'OS-1', Status: 'Execução', Valor_Total: '100', Os_Cliente: 'Y' }, { Id_Ordem: 'OS-2', Status: 'Execução', Valor_Total: '1' }],
    criadoresOS: { 'OS-1': 'Larissa Garcia' },
    requisicoes: [{ id: 7, status: 'pedido', created_at: '2026-10-20T10:00:00Z', criado_por: 'Mariano Ramos Do Val', solicitante: 'Henri Irneh' }],
  });
  it('OS: quem criou vem do histórico; sem registro fica em branco e conta como "não informado"', () => {
    const r = itensDoKpi('os_por_fase', 'TODAS', f);
    expect(r.itens.find((i) => i.chave === 'os-OS-1')!.criado_por).toBe('Larissa Garcia');
    expect(r.itens.find((i) => i.chave === 'os-OS-2')!.criado_por).toBeNull();
    expect(r.por_criador).toEqual([['Larissa Garcia', 1], ['não informado', 1]]);
  });
  it('requisição: criado_por antes do solicitante', () => {
    expect(itensDoKpi('requisicoes_abertas', 'TODAS', f).itens[0].criado_por).toBe('Mariano Ramos Do Val');
  });
  it('sem criador em ninguém: sem tabela por quem criou', () => {
    expect(porCriador([{ criado_por: null }])).toBeNull();
  });
  it('PV e remessas da Omie: número, idade, quem criou e a lista mais antiga primeiro', () => {
    const pv = [
      itemPedidoOmie({ idPedido: 1, numero: '7820', nomeCliente: 'ROSA &amp; RIBEIRO', etapaNome: 'Faturar', valorTotal: 100, dataInclusao: '10/10/2026', diasAberto: 17, criadoPorNome: 'Zezo' }, 'NOVA'),
      itemPedidoOmie({ idPedido: 2, numero: '7000', nomeCliente: 'B', valorTotal: 50, dataInclusao: '01/06/2026', criadoPorLogin: 'P000454175' }, 'NOVA'),
    ];
    expect(pv[0]).toMatchObject({ titulo: 'PV 7820 · ROSA & RIBEIRO', data: '2026-10-10', criado_por: 'Zezo', href: '/ajustes/pedidos?conta=NOVA' });
    const l = linhaOmie('pv_omie_aberto', 'NOVA', pv, HOJE);
    expect(l).toMatchObject({ kpi_id: 'pv_omie_aberto', conta: 'NOVA', contagem: 2, valor: 150, fonte: 'omie', erro: null });
    expect(l.detalhe.itens.map((i: { chave: string }) => i.chave)).toEqual(['pv-NOVA-2', 'pv-NOVA-1']);
    expect(l.detalhe.mais_antigo_dias).toBeGreaterThan(90);
    expect(l.detalhe.por_criador).toEqual([['P000454175', 1], ['Zezo', 1]]);
    const rem = itemRemessaOmie({ idRemessa: 9, numero: '55', nomeCliente: 'C', dataPrevisao: null, diasAberto: null, numeroOS: '0777', origem: 'OS', criadoPorNome: 'Larissa Garcia', vendedorNome: 'Zezo', valorTotal: 10 }, 'CASTRO');
    expect(rem).toMatchObject({ titulo: 'REM 55 · C', sub: 'da OS 0777 · vendedor Zezo · CASTRO', criado_por: 'Larissa Garcia' });
    expect(linhaOmie('rem_omie_aberta', 'TODAS', [rem], HOJE).detalhe.por_idade['sem data']).toBe(1);
  });
  it('a tela inteira não leva a lista gravada (só o drill-down)', () => {
    const l = linhaOmie('pv_omie_aberto', 'NOVA', [], HOJE);
    expect('itens' in l.detalhe).toBe(true);
    expect('itens' in semItens(l).detalhe).toBe(false);
  });
  it('frescor da Omie (rodada a cada 2 h): amarelo depois de 4 h', () => {
    expect(frescor(200, 'omie')).toBe('verde');
    expect(frescor(300, 'omie')).toBe('amarelo');
  });
  it('mesma pessoa com e sem acento vira uma linha só', () => {
    expect(porCriador([{ criado_por: 'Jose Ortiz' }, { criado_por: 'José Ortiz' }, { criado_por: 'José Ortiz' }])).toEqual([['José Ortiz', 3]]);
  });
});

describe('o snapshot de 5 min nunca chama a Omie', () => {
  it('nenhum arquivo de src/lib/planta importa lib/omie no topo (a Omie é só a tarefa planta-omie-abertos)', () => {
    const dir = join(__dirname, '..');
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/from ['"][^'"]*\/omie[/'"]/);
    }
  });
});
