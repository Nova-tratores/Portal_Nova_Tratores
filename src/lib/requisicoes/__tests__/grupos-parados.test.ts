import { describe, expect, it } from 'vitest';
import { ACAO_AVISO_PARADO, ehQuemCriou, podeFinalizarGrupo, precisaAvisarParado, ultimaAtividade } from '../grupos-parados';

describe('grupos: quem finaliza', () => {
  it('quem criou (nome sem acento/caixa) ou Dev; grupo sem criador é livre', () => {
    expect(ehQuemCriou('Vinícius Correa', { nome: 'vinicius correa' })).toBe(true);
    expect(podeFinalizarGrupo('Henri Irneh', { nome: 'Vinicius Correa' })).toBe(false);
    expect(podeFinalizarGrupo('Henri Irneh', { nome: 'Vinicius Correa', isDev: true })).toBe(true);
    expect(podeFinalizarGrupo('h@x.com', { nome: 'Henri', email: 'H@x.com' })).toBe(true);
    expect(podeFinalizarGrupo(null, { nome: 'Qualquer' })).toBe(true);
  });
});

describe('grupos: aviso de parado (30 dias)', () => {
  const agora = new Date('2026-11-17T12:00:00Z');
  it('avisa grupo aberto sem atividade há 30+ dias; o próprio aviso não conta como atividade e só repete após 30 dias', () => {
    const g = { id: 1, nome: 'X', status: 'aberto', created_at: '2026-09-01T10:00:00Z', historico: [{ acao: 'adicionou', usuario: 'A', em: '2026-10-10T10:00:00Z' }] };
    expect(ultimaAtividade(g)).toBe('2026-10-10T10:00:00Z');
    expect(precisaAvisarParado(g, agora)).toEqual({ avisar: true, diasParado: 38 });
    const avisado = { ...g, historico: [...g.historico, { acao: ACAO_AVISO_PARADO, usuario: 'Robô', em: '2026-11-01T10:00:00Z' }] };
    expect(precisaAvisarParado(avisado, agora).avisar).toBe(false);
    expect(precisaAvisarParado({ ...g, status: 'concluido' }, agora).avisar).toBe(false);
    expect(precisaAvisarParado({ ...g, historico: [{ acao: 'adicionou', usuario: 'A', em: '2026-11-10T10:00:00Z' }] }, agora).avisar).toBe(false);
  });
});
