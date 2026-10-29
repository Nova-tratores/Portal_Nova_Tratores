import { describe, expect, it } from 'vitest';
import { decidirFaseAuto, ehRobo, hojeBrasilia, ultimoDiaServico } from '../fase-auto';

const HOJE = '2026-10-23';

describe('fase automática por data', () => {
  it('previsão de execução chegou NÃO move mais para Execução (José, 29/10/2026)', () => {
    expect(decidirFaseAuto({ Status: 'Orçamento', Previsao_Execucao: '2026-10-23' }, HOJE, null)).toBeNull();
    expect(decidirFaseAuto({ Status: 'Orçamento Aprovado', Previsao_Execucao: '2026-10-23' }, HOJE, null)).toBeNull();
    expect(decidirFaseAuto({ Status: 'Aguardando ordem Técnico', Previsao_Execucao: '2026-10-23' }, HOJE, null)).toBeNull();
  });
  it('passou o último dia de serviço → Aguardando ordem Técnico', () => {
    expect(decidirFaseAuto({ Status: 'Execução', Previsao_Execucao: '2026-10-20', Dias_Execucao: '2026-10-21,2026-10-22' }, HOJE, null)?.destino).toBe('Aguardando ordem Técnico');
    // ainda no último dia: fica em Execução
    expect(decidirFaseAuto({ Status: 'Execução', Dias_Execucao: '2026-10-23' }, HOJE, null)).toBeNull();
  });
  it('os dois robôs antigos brigavam; agora as regras não se contradizem', () => {
    // Aguardando com serviço já encerrado NÃO volta para Execução
    expect(decidirFaseAuto({ Status: 'Aguardando ordem Técnico', Previsao_Execucao: '2026-10-20', Dias_Execucao: '2026-10-22' }, HOJE, null)).toBeNull();
  });
  it('pessoa desfez a mudança: o robô não muda de novo', () => {
    // robô levou para Aguardando em 23/10; pessoa tirou de Aguardando (voltou para Execução) no mesmo dia
    expect(decidirFaseAuto({ Status: 'Execução', Dias_Execucao: '2026-10-21' }, HOJE, { dia: '2026-10-23', de: 'Aguardando ordem Técnico' })).toBeNull();
    // a pessoa mexeu ANTES do gatilho: a regra vale
    expect(decidirFaseAuto({ Status: 'Execução', Dias_Execucao: '2026-10-21' }, HOJE, { dia: '2026-10-20', de: 'Aguardando ordem Técnico' })?.destino).toBe('Aguardando ordem Técnico');
  });
  it('previsão de faturamento → Relatório Concluído', () => {
    expect(decidirFaseAuto({ Status: 'Executada aguardando comercial', Previsao_Faturamento: '2026-10-22' }, HOJE, null)?.destino).toBe('Relatório Concluído');
  });
  it('OS faturada, concluída ou cancelada nunca muda sozinha', () => {
    expect(decidirFaseAuto({ Status: 'Orçamento', Previsao_Execucao: '2026-10-01', faturado_omie_em: '2026-10-02' }, HOJE, null)).toBeNull();
    expect(decidirFaseAuto({ Status: 'Concluída', Previsao_Execucao: '2026-10-01' }, HOJE, null)).toBeNull();
  });
  it('hoje é o de Brasília (às 22h de Brasília o servidor já está no dia seguinte)', () => {
    expect(hojeBrasilia(new Date('2026-10-24T01:30:00Z'))).toBe('2026-10-23');
    expect(ultimoDiaServico('2026-10-20', '')).toBe('2026-10-20');
  });
  it('robô × pessoa', () => {
    expect(ehRobo('Sistema')).toBe(true);
    expect(ehRobo('Automático (datas)')).toBe(true);
    expect(ehRobo('Tratorilson (auto)')).toBe(true);
    expect(ehRobo('Larissa Garcia')).toBe(false);
  });
});
