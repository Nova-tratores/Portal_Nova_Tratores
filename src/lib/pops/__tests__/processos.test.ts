import { describe, it, expect } from 'vitest';
import { situacaoDoProcesso, atrasado, podeEditarProcesso, resumir, validarEdicao, pronto } from '../processos';

const pop = { arquivado: false };
describe('situação do processo (sai do POP ligado)', () => {
  it('sem POP ligado', () => expect(situacaoDoProcesso(null, [])).toBe('sem_pop'));
  it('só rascunho / em revisão', () => {
    expect(situacaoDoProcesso(pop, ['rascunho'])).toBe('rascunho');
    expect(situacaoDoProcesso(pop, ['em_revisao'])).toBe('em_revisao');
  });
  it('publicado, com ou sem nova versão em edição', () => {
    expect(situacaoDoProcesso(pop, ['publicado'])).toBe('publicado');
    expect(situacaoDoProcesso(pop, ['publicado', 'rascunho'])).toBe('publicado_editando');
    expect(situacaoDoProcesso(pop, ['obsoleto', 'publicado'])).toBe('publicado');
  });
  it('POP arquivado', () => expect(situacaoDoProcesso({ arquivado: true }, ['publicado'])).toBe('arquivado'));
  it('pronto = publicado (com ou sem edição)', () => {
    expect(pronto('publicado_editando')).toBe(true);
    expect(pronto('em_revisao')).toBe(false);
  });
});

describe('atrasado', () => {
  it('prazo vencido e POP não publicado', () => {
    expect(atrasado('2026-10-01', '2026-10-22', 'rascunho')).toBe(true);
    expect(atrasado('2026-10-01', '2026-10-22', 'publicado')).toBe(false);
    expect(atrasado('2026-10-30', '2026-10-22', 'sem_pop')).toBe(false);
    expect(atrasado(null, '2026-10-22', 'sem_pop')).toBe(false);
  });
});

describe('quem edita', () => {
  const base = { userId: 'u', isAdmin: false, modulos: [] as string[], papeisArea: [] as { area_id: string; papel: 'dono' | 'aprovador' }[] };
  it('admin do portal e admin do módulo editam tudo', () => {
    expect(podeEditarProcesso({ ...base, isAdmin: true }, 'A')).toBe(true);
    expect(podeEditarProcesso({ ...base, modulos: ['pops:admin'] }, 'A')).toBe(true);
  });
  it('dono da área edita só a sua; aprovador não edita', () => {
    const dono = { ...base, papeisArea: [{ area_id: 'A', papel: 'dono' as const }] };
    expect(podeEditarProcesso(dono, 'A')).toBe(true);
    expect(podeEditarProcesso(dono, 'B')).toBe(false);
    expect(podeEditarProcesso({ ...base, papeisArea: [{ area_id: 'A', papel: 'aprovador' as const }] }, 'A')).toBe(false);
  });
});

describe('resumo e validação', () => {
  it('conta por situação, prontos, atrasados e sem dono', () => {
    const r = resumir([
      { situacao: 'publicado', atrasado: false, dono_id: 'x' },
      { situacao: 'sem_pop', atrasado: true, dono_id: null },
      { situacao: 'rascunho', atrasado: false, dono_id: null },
      { situacao: 'publicado_editando', atrasado: false, dono_id: 'y' },
    ]);
    expect(r).toMatchObject({ total: 4, prontos: 2, pct: 50, atrasados: 1, semDono: 2 });
    expect(r.porSituacao.sem_pop).toBe(1);
  });
  it('valida prioridade, prazo e nome', () => {
    expect(validarEdicao({ prioridade: 'urgente' })).toEqual({ erro: 'Prioridade inválida.' });
    expect(validarEdicao({ prazo: '22/10/2026' })).toEqual({ erro: 'Prazo inválido.' });
    expect(validarEdicao({ titulo: 'ab' })).toHaveProperty('erro');
    expect(validarEdicao({ prioridade: 'alta', prazo: '', dono_id: '' })).toEqual({ campos: { prioridade: 'alta', prazo: null, dono_id: null } });
  });
});
