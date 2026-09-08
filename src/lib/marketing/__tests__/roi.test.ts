import { describe, it, expect } from 'vitest';
import { calcularROI, type EntradaROI } from '../roi';
import { PROPOSTA_PERDIDA, PROPOSTA_VENDIDA } from '../tipos';
import type { Acao, Apoio, Custo, Lead, PropostaVinculada } from '../tipos';

const HOJE = '2026-09-04';

const acao = (over: Partial<Acao> = {}) =>
  ({
    id: 'a1',
    nome: 'IRRIGASHOW 2026',
    orcamento_previsto: null,
    meta_leads: null,
    meta_vendas: null,
    meta_receita: null,
    data_fim: null,
    responsavel_id: null,
    ...over,
  }) as EntradaROI['acao'];

const custo = (over: Partial<Custo> = {}): Custo => ({
  id: over.id ?? 'c1', acao_id: 'a1', descricao: 'x', categoria: 'estande',
  fornecedor: null, data: null, vinculo_tipo: null, vinculo_ref: null,
  vinculo_label: null, origem: 'manual', valor: 0, valor_fonte: null,
  sincronizado_em: null, rateio_percent: 100, status: 'confirmado',
  observacoes: null, anexo_url: null, criado_em: '2026-01-01T00:00:00Z', ...over,
});

const apoio = (over: Partial<Apoio> = {}): Apoio => ({
  id: over.id ?? 'ap1', acao_id: 'a1', apoiador: 'Mahindra', tipo: 'verba',
  descricao: null, valor_previsto: null, valor_aprovado: null, valor_recebido: null,
  status: 'aprovado', processo_numero: null, documento_tipo: null,
  documento_numero: null, documento_emitido_em: null, documento_url: null,
  previsao_credito: null, credito_em: null, forma_credito: null,
  contrapartida_texto: null, contrapartida_prazo: null, relatorio_status: 'pendente',
  relatorio_enviado_em: null, relatorio_enviado_para: [], relatorio_url: null,
  responsavel_id: null, responsavel_nome: null, observacoes: null,
  criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z', ...over,
});

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: over.id ?? 'l1', acao_id: 'a1', texto: 'quer trator', nome: null,
  telefone: null, telefone_norm: null, cidade: null, interesse: null, foto_url: null,
  cliente_cod_cli: null, cliente_empresa: null, cliente_nome: null,
  qualificacao: 'novo', temperatura: null, responsavel_nome: null,
  proximo_contato: null, observacoes: null, capturado_em: '2026-06-01T00:00:00Z',
  capturado_por_nome: null, ...over,
});

const prop = (over: Partial<PropostaVinculada> = {}): PropostaVinculada => ({
  proposta_id: 1, peso: 1, status: PROPOSTA_VENDIDA, valor_total: 0,
  cliente: null, vendedor_nome: null, criado_em: null, ...over,
});

const base = (over: Partial<EntradaROI> = {}): EntradaROI => ({
  acao: acao(), custos: [], apoios: [], leads: [], propostas: [], hoje: HOJE, ...over,
});

describe('divisão por zero', () => {
  // O defeito mais provável do módulo: um card mostrando "Infinity%".
  it('nunca devolve Infinity nem NaN quando o denominador é zero', () => {
    const r = calcularROI(base());
    expect(r.roi).toBeNull();
    expect(r.custoPorLead).toBeNull();
    expect(r.cac).toBeNull();
    expect(r.taxaConversaoLead).toBeNull();
    expect(r.orcamentoVsRealizado).toBeNull();
    expect(r.metaLeadsPercent).toBeNull();
    for (const v of Object.values(r)) {
      expect(Number.isNaN(v as number)).toBe(false);
      expect(v).not.toBe(Infinity);
    }
  });

  it('custo líquido zerado pela fábrica não tem ROI definido', () => {
    const r = calcularROI(
      base({
        custos: [custo({ valor: 20_000 })],
        apoios: [apoio({ valor_aprovado: 20_000, valor_recebido: 20_000, status: 'recebido', relatorio_status: 'aceito' })],
        propostas: [prop({ valor_total: 400_000 })],
      }),
    );
    expect(r.custoLiquido).toBe(0);
    expect(r.roi).toBeNull();
  });
});

describe('apoio de fábrica', () => {
  it('aprovado mas NÃO recebido não abate o custo líquido', () => {
    const r = calcularROI(
      base({
        custos: [custo({ valor: 35_000 })],
        apoios: [apoio({ valor_aprovado: 20_000, valor_recebido: null })],
      }),
    );
    expect(r.apoioAprovado).toBe(20_000);
    expect(r.apoioRecebido).toBe(0);
    expect(r.apoioAReceber).toBe(20_000);
    expect(r.custoLiquido).toBe(35_000);
  });

  it('apoio recusado ou cancelado sai da conta inteira', () => {
    const r = calcularROI(
      base({
        apoios: [
          apoio({ id: 'x', status: 'recusado', valor_aprovado: 50_000, valor_recebido: 50_000 }),
          apoio({ id: 'y', status: 'cancelado', valor_aprovado: 10_000 }),
        ],
      }),
    );
    expect(r.apoioAprovado).toBe(0);
    expect(r.apoioRecebido).toBe(0);
    expect(r.alertas).toHaveLength(0);
  });

  it('contrapartida vencida vira alerta de gravidade alta', () => {
    const r = calcularROI(
      base({ apoios: [apoio({ contrapartida_prazo: '2026-08-01', relatorio_status: 'pendente' })] }),
    );
    const a = r.alertas.find((x) => x.tipo === 'contrapartida_vencida');
    expect(a?.gravidade).toBe('alta');
    expect(a?.apoioId).toBe('ap1');
  });

  it('relatório já aceito não gera alerta de prazo', () => {
    const r = calcularROI(
      base({ apoios: [apoio({ contrapartida_prazo: '2026-08-01', relatorio_status: 'aceito', valor_aprovado: 10, valor_recebido: 10, status: 'recebido' })] }),
    );
    expect(r.alertas.filter((x) => x.tipo.startsWith('contrapartida'))).toHaveLength(0);
  });

  it('prazo dentro de 30 dias avisa com gravidade média', () => {
    const r = calcularROI(
      base({ apoios: [apoio({ contrapartida_prazo: '2026-09-20' })] }),
    );
    expect(r.alertas.find((x) => x.tipo === 'contrapartida_proxima')?.gravidade).toBe('media');
  });
});

describe('propostas e atribuição', () => {
  // Os literais do Comercial são traiçoeiros: repare no espaço depois do hífen
  // e no ponto final. Um typo aqui zera a receita sem erro nenhum aparecer.
  it('conta como venda o status EXATO Concluida-Vendido', () => {
    const r = calcularROI(base({ propostas: [prop({ status: PROPOSTA_VENDIDA, valor_total: 400_000 })] }));
    expect(r.vendasN).toBe(1);
    expect(r.receitaAtribuida).toBe(400_000);
  });

  it('"Concluida- Não vendido." NÃO conta como venda nem como pipeline', () => {
    const r = calcularROI(base({ propostas: [prop({ status: PROPOSTA_PERDIDA, valor_total: 400_000 })] }));
    expect(r.vendasN).toBe(0);
    expect(r.receitaAtribuida).toBe(0);
    expect(r.pipelineAbertoN).toBe(0);
    expect(r.propostasN).toBe(1);
  });

  it('peso 0,5 divide a receita atribuída', () => {
    const r = calcularROI(base({ propostas: [prop({ peso: 0.5, valor_total: 400_000 })] }));
    expect(r.receitaAtribuida).toBe(200_000);
  });

  it('proposta em aberto vai pro pipeline, não pra receita', () => {
    const r = calcularROI(
      base({ propostas: [prop({ status: 'AGUARDANDO RESPOSTA BANCO', valor_total: 300_000 })] }),
    );
    expect(r.pipelineAbertoN).toBe(1);
    expect(r.pipelineAbertoValor).toBe(300_000);
    expect(r.receitaAtribuida).toBe(0);
  });

  it('Valor_Total em formato BR e americano dá o mesmo resultado', () => {
    const br = calcularROI(base({ propostas: [prop({ valor_total: '1.234.567,89' })] }));
    expect(br.receitaAtribuida).toBeCloseTo(1_234_567.89, 2);
    const us = calcularROI(base({ propostas: [prop({ valor_total: '800.00' })] }));
    expect(us.receitaAtribuida).toBeCloseTo(800, 2);
  });
});

describe('leads', () => {
  it('descartado sai da base; qualificado/proposta/ganho contam como qualificados', () => {
    const r = calcularROI(
      base({
        leads: [
          lead({ id: '1', qualificacao: 'novo' }),
          lead({ id: '2', qualificacao: 'qualificado' }),
          lead({ id: '3', qualificacao: 'ganho' }),
          lead({ id: '4', qualificacao: 'descartado' }),
        ],
      }),
    );
    expect(r.leads).toBe(3);
    expect(r.leadsQualificados).toBe(2);
  });
});

describe('IRRIGASHOW 2026 — conferência número a número', () => {
  // Custo 35.000 (30.000 confirmado + 5.000 previsto), apoio de 20.000 recebido,
  // 3 vendas de 400.000 cada. Contas feitas à mão:
  //   confirmado ......... 30.000
  //   líquido ............ 30.000 - 20.000 = 10.000
  //   receita ............ 1.200.000
  //   ROI ................ 1.200.000 / 10.000 = 120
  //   custo por lead ..... 30.000 / 40 = 750
  //   CAC ................ 30.000 / 3 = 10.000
  //   conversão .......... 3 / 40 = 0,075
  const entrada = base({
    acao: acao({ orcamento_previsto: 30_000, meta_leads: 50, meta_vendas: 4, data_fim: '2026-07-10' }),
    custos: [
      custo({ id: 'c1', valor: 18_000, categoria: 'estande' }),
      custo({ id: 'c2', valor: 12_000, categoria: 'transporte' }),
      custo({ id: 'c3', valor: 5_000, categoria: 'brinde', status: 'previsto' }),
      custo({ id: 'c4', valor: 99_000, status: 'cancelado' }),
    ],
    apoios: [apoio({ valor_aprovado: 20_000, valor_recebido: 20_000, status: 'recebido', relatorio_status: 'pendente', contrapartida_prazo: '2026-10-31' })],
    leads: Array.from({ length: 40 }, (_, i) => lead({ id: `l${i}` })),
    propostas: [
      prop({ proposta_id: 1, valor_total: 400_000 }),
      prop({ proposta_id: 2, valor_total: 400_000 }),
      prop({ proposta_id: 3, valor_total: 400_000 }),
    ],
  });

  const r = calcularROI(entrada);

  it('custos', () => {
    expect(r.custoConfirmado).toBe(30_000);
    expect(r.custoPrevisto).toBe(5_000);
    expect(r.custoTotal).toBe(35_000);
    expect(r.custoPorCategoria).toEqual({ estande: 18_000, transporte: 12_000 });
  });

  it('apoio e custo líquido', () => {
    expect(r.apoioRecebido).toBe(20_000);
    expect(r.apoioAReceber).toBe(0);
    expect(r.custoLiquido).toBe(10_000);
  });

  it('indicadores', () => {
    expect(r.receitaAtribuida).toBe(1_200_000);
    expect(r.roi).toBeCloseTo(120, 6);
    expect(r.custoPorLead).toBeCloseTo(750, 6);
    expect(r.cac).toBeCloseTo(10_000, 6);
    expect(r.taxaConversaoLead).toBeCloseTo(0.075, 6);
    expect(r.metaLeadsPercent).toBeCloseTo(0.8, 6);
    expect(r.metaVendasPercent).toBeCloseTo(0.75, 6);
  });

  it('avisa que passou do orçamento e que o relatório ainda é devido', () => {
    expect(r.alertas.map((a) => a.tipo)).toContain('custo_acima_orcamento');
    // prazo 31/10 está a mais de 30 dias de 04/09 — ainda não alerta.
    expect(r.alertas.map((a) => a.tipo)).not.toContain('contrapartida_proxima');
  });
});

describe('ação encerrada sem custo', () => {
  it('avisa que o ROI seria fantasia', () => {
    const r = calcularROI(base({ acao: acao({ data_fim: '2026-07-10' }) }));
    expect(r.alertas.map((a) => a.tipo)).toContain('sem_custo_lancado');
  });
});
