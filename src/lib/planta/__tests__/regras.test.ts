import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcularKpis, frescor, prepararParaUsuario, filtrarConta, isoDe, CATALOGO, type Fontes, type LinhaKpi } from '../regras';

const HOJE = '2026-10-19';
function fontes(p: Partial<Fontes> = {}): Fontes {
  return { hoje: HOJE, pagar: [], receber: [], fila: [], pedidosFabrica: [], nfMaquinas: [], pedidos: [], os: [], metricasAbertas: [], alocacao: [], negativos: [], robos: {}, falhas: {}, ...p };
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
      { status: 'Orçamento', valor_total: 100, status_desde: '2026-10-18T10:00:00Z' },
      { status: 'Concluída', valor_total: 999 },
      { status: 'Cancelada', valor_total: 999 },
      { status: 'Execução', valor_total: 50, data: '01/10/2026 10:00' },
    ] }));
    expect(k(ls, 'ppv_aberto')).toMatchObject({ contagem: 2, valor: 150 });
    expect(k(ls, 'ppv_aberto').detalhe.por_idade).toEqual({ '0-2': 1, '3-7': 0, '8+': 1, 'sem data': 0 });
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
    const ls = calcularKpis(fontes({ falhas: { oficina: 'Ordem_Servico: timeout' }, alocacao: [{ conta_omie: 'NOVA' }] }));
    expect(k(ls, 'os_por_fase').erro).toBe('Ordem_Servico: timeout');
    expect(k(ls, 'pecas_a_alocar', 'NOVA')).toMatchObject({ contagem: 1, erro: null });
  });
  it('todo número do catálogo sai em toda rodada', () => {
    const ids = new Set(calcularKpis(fontes()).map((l) => l.kpi_id));
    expect([...ids].sort()).toEqual(Object.keys(CATALOGO).sort());
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
    expect(f.find((x) => x.kpi_id === 'ppv_aberto')!.conta).toBe('TODAS');
    expect(f.filter((x) => x.kpi_id === 'pagar_vencido')).toHaveLength(1);
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

describe('a planta nunca chama a Omie', () => {
  it('nenhum arquivo de src/lib/planta importa lib/omie', () => {
    const dir = join(__dirname, '..');
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/from ['"][^'"]*\/omie[/'"]/);
    }
  });
});
