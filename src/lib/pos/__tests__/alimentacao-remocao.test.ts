import { describe, it, expect } from 'vitest';
import { alimentacoesRemovidas, linhasHistoricoRemocao, motivoValido, normalizarRemocoes, textoRemocao } from '../alimentacao-remocao';

const a = (data: string, valor: number, tecnicos: string[] = ['José Oliveira']) => ({ data, valor, tecnicos });

describe('remoção de alimentação com motivo', () => {
  it('motivo precisa de pelo menos 5 caracteres', () => {
    expect(motivoValido('')).toBe(false);
    expect(motivoValido('  ok  ')).toBe(false);
    expect(motivoValido('Lançado em dobro')).toBe(true);
  });

  it('acha o que saiu, contando repetidos', () => {
    const antes = [a('2026-11-20', 45), a('2026-11-20', 45), a('2026-11-21', 50)];
    expect(alimentacoesRemovidas(antes, [a('2026-11-20', 45), a('2026-11-21', 50)])).toEqual([a('2026-11-20', 45)]);
    expect(alimentacoesRemovidas(antes, antes)).toEqual([]);
  });

  it('linha do histórico com o motivo da tela', () => {
    const antes = [a('2026-11-20', 45), a('2026-11-21', 50)];
    const linhas = linhasHistoricoRemocao(antes, [a('2026-11-20', 45)], normalizarRemocoes([{ ...a('2026-11-21', 50), motivo: 'Cliente pagou o almoço' }]));
    expect(linhas).toEqual(['Alimentação removida — 21/11/2026 · R$ 50,00 · José Oliveira — motivo: Cliente pagou o almoço']);
  });

  it('removido sem motivo também fica registrado', () => {
    expect(linhasHistoricoRemocao([a('2026-11-21', 50)], [], [])).toEqual(['Alimentação removida — 21/11/2026 · R$ 50,00 · José Oliveira — sem motivo informado']);
  });

  it('valor editado antes de remover: usa o motivo na ordem', () => {
    const linhas = linhasHistoricoRemocao([a('2026-11-21', 50)], [], normalizarRemocoes([{ ...a('2026-11-21', 60), motivo: 'Dia não trabalhado' }]));
    expect(linhas[0]).toContain('motivo: Dia não trabalhado');
  });

  it('descarta motivo vazio vindo da tela', () => {
    expect(normalizarRemocoes([{ data: '2026-11-21', valor: 1, motivo: ' ' }, 'x'])).toEqual([]);
    expect(textoRemocao({ data: '', valor: 0 }, null)).toBe('Alimentação removida — sem data · R$ 0,00 — sem motivo informado');
  });
});
