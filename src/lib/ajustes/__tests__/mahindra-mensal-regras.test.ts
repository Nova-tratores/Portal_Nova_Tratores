import { describe, it, expect } from 'vitest';
import { mesAnteriorSP, fechamentoDoMes, arquivoReaproveitavel, mesPorExtenso, contasDoParametro } from '../mahindra-mensal-regras';

describe('mesAnteriorSP', () => {
  it('dia 2 de novembro → outubro', () => {
    expect(mesAnteriorSP(new Date('2026-11-02T10:00:00Z'))).toBe('2026-10');
  });
  it('janeiro → dezembro do ano anterior', () => {
    expect(mesAnteriorSP(new Date('2027-01-02T10:00:00Z'))).toBe('2026-12');
  });
  it('usa o fuso de Brasília (01/11 01:00 UTC ainda é 31/10 em SP)', () => {
    expect(mesAnteriorSP(new Date('2026-11-01T01:00:00Z'))).toBe('2026-09');
  });
});

describe('fechamentoDoMes', () => {
  it('outubro fecha em 01/11 00:00 de Brasília', () => {
    expect(fechamentoDoMes('2026-10').toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
  it('dezembro fecha em janeiro do ano seguinte', () => {
    expect(fechamentoDoMes('2026-12').toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});

describe('arquivoReaproveitavel', () => {
  const arq = (id: number, mes: string, criado_em: string, conta_omie = 'NOVA') => ({ id, mes, criado_em, conta_omie });
  it('ignora o gerado antes do mês fechar e pega o mais recente depois', () => {
    const lista = [
      arq(1, '2026-10', '2026-10-31T20:00:00Z'),
      arq(2, '2026-10', '2026-11-01T12:00:00Z'),
      arq(3, '2026-10', '2026-11-02T10:00:00Z'),
      arq(4, '2026-09', '2026-11-02T11:00:00Z'),
      arq(5, '2026-10', '2026-11-02T12:00:00Z', 'CASTRO'),
    ];
    expect(arquivoReaproveitavel(lista, '2026-10', 'NOVA')?.id).toBe(3);
  });
  it('nada serve → null', () => {
    expect(arquivoReaproveitavel([arq(1, '2026-10', '2026-10-15T00:00:00Z')], '2026-10', 'NOVA')).toBeNull();
  });
});

describe('textos e parâmetros', () => {
  it('mês por extenso', () => {
    expect(mesPorExtenso('2026-10')).toBe('outubro/2026');
  });
  it('contas: padrão NOVA, aceita lista e ignora lixo', () => {
    expect(contasDoParametro('')).toEqual(['NOVA']);
    expect(contasDoParametro('nova, castro')).toEqual(['NOVA', 'CASTRO']);
    expect(contasDoParametro('XPTO')).toEqual(['NOVA']);
  });
});
