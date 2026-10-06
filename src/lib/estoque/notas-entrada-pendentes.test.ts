import { describe, it, expect } from 'vitest';
import { rotuloPendencia, normalizarPendente, filtrarPendentes, emissaoBR } from './notas-entrada-pendentes';

describe('rotuloPendencia', () => {
  it('etapa 40 Faturada = entrada não concluída', () => {
    expect(rotuloPendencia('40', 'Faturada')).toBe('Faturada (etapa 40) — entrada ainda não concluída');
  });
  it('cancelada', () => {
    expect(rotuloPendencia('40', 'Cancelada')).toBe('Cancelada na Omie (etapa 40)');
  });
  it('recebida', () => {
    expect(rotuloPendencia('60', 'Recebida')).toBe('Recebida (etapa 60)');
  });
  it('sem status usa a etapa', () => {
    expect(rotuloPendencia('20', '')).toBe('Etapa 20 — entrada ainda não concluída');
  });
});

describe('normalizarPendente', () => {
  it('caso real: NF 000001114 do Barracão do Landico (NOVA, etapa 40)', () => {
    const p = normalizarPendente({
      id_receb: 2540532468, conta_omie: 'nova', numero_nfe: '000001114', serie_nfe: '1',
      fornecedor: 'BARRACAO DO LANDICO', emissao_nfe: '2026-09-28', etapa: '40', status: 'Faturada',
      total_nfe: 588.62, qtd_itens: 36,
    });
    expect(p.conta).toBe('NOVA');
    expect(p.numeroNf).toBe('1114');
    expect(p.emissao).toBe('28/09/2026');
    expect(p.cancelada).toBe(false);
    expect(p.valor).toBe(588.62);
    expect(p.rotulo).toContain('entrada ainda não concluída');
  });
  it('emissão já em BR e fornecedor vazio', () => {
    const p = normalizarPendente({ id_receb: 1, conta_omie: 'castro', numero_nfe: '0', emissao_nfe: '07/10/2024', fornecedor: '' });
    expect(p.emissao).toBe('07/10/2024');
    expect(p.numeroNf).toBe('0');
    expect(p.fornecedor).toBe('(fornecedor não informado)');
  });
  it('emissaoBR mantém string desconhecida', () => {
    expect(emissaoBR('')).toBe('');
    expect(emissaoBR('2025-03-21T00:00:00')).toBe('21/03/2025');
  });
});

describe('filtrarPendentes', () => {
  it('tira recebidas, mantém faturadas e manda canceladas para o fim', () => {
    const r = filtrarPendentes([
      { id_receb: 1, numero_nfe: '000001114', etapa: '40', status: 'Cancelada' },
      { id_receb: 2, numero_nfe: '000001114', etapa: '60', status: 'Recebida' },
      { id_receb: 3, numero_nfe: '000001114', etapa: '40', status: 'Faturada' },
    ]);
    expect(r.map((p) => p.idReceb)).toEqual(['3', '1']);
  });
});
