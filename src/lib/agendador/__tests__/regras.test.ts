import { describe, it, expect } from 'vitest';
import {
  estaNaHora, proximaExecucao, descreverQuando, validarHorario, falhouDuasSeguidas, partesSP,
  type Agendamento,
} from '../regras';

// Horário de Brasília → Date (UTC-3)
const sp = (s: string) => new Date(`${s}-03:00`);

function ag(p: Partial<Agendamento>): Agendamento {
  return {
    chave: 'x', handler: 'x', nome: 'X', modulo: '', descricao: '', tipo: 'intervalo',
    hora: null, intervalo_min: null, dias_semana: null, janela_inicio: null, janela_fim: null,
    dia_mes: null, executar_em: null, parametros: {}, prioridade: 'pesado', usa_omie: false,
    grupo: null, duracao_max_min: 60, ativo: true, pausado_por: null, pausado_motivo: null,
    pausado_em: null, origem: 'portal', ...p,
  };
}

describe('partesSP', () => {
  it('converte para Brasília', () => {
    const p = partesSP(new Date('2026-10-14T02:30:00Z')); // 23:30 do dia 13 em SP
    expect(p.dia).toBe(13);
    expect(p.minutos).toBe(23 * 60 + 30);
    expect(p.diaSemana).toBe(2); // terça
  });
});

describe('intervalo', () => {
  const a = ag({ tipo: 'intervalo', intervalo_min: 10 });
  it('roda se nunca rodou ou já passou o intervalo', () => {
    expect(estaNaHora(a, null, sp('2026-10-14T10:00:00'))).toBe(true);
    expect(estaNaHora(a, sp('2026-10-14T09:55:00'), sp('2026-10-14T10:00:00'))).toBe(false);
    expect(estaNaHora(a, sp('2026-10-14T09:50:00'), sp('2026-10-14T10:00:00'))).toBe(true);
  });
  it('tolera alguns segundos de atraso do laço', () => {
    expect(estaNaHora(a, sp('2026-10-14T09:50:10'), sp('2026-10-14T10:00:00'))).toBe(true);
  });
  it('respeita janela e dias', () => {
    const b = ag({ tipo: 'intervalo', intervalo_min: 10, dias_semana: [1, 2, 3, 4, 5, 6], janela_inicio: '07:00', janela_fim: '20:00' });
    expect(estaNaHora(b, null, sp('2026-10-14T06:59:00'))).toBe(false);
    expect(estaNaHora(b, null, sp('2026-10-14T07:00:00'))).toBe(true);
    expect(estaNaHora(b, null, sp('2026-10-14T20:00:00'))).toBe(false);
    expect(estaNaHora(b, null, sp('2026-10-18T10:00:00'))).toBe(false); // domingo
  });
  it('próxima execução pula para a janela seguinte', () => {
    const b = ag({ tipo: 'intervalo', intervalo_min: 10, janela_inicio: '07:00', janela_fim: '20:00' });
    const p = proximaExecucao(b, sp('2026-10-14T19:55:00'), sp('2026-10-14T19:58:00'))!;
    expect(partesSP(p).dia).toBe(15);
    expect(partesSP(p).minutos).toBe(7 * 60);
  });
});

describe('diário', () => {
  const a = ag({ tipo: 'diario', hora: '20:00' });
  it('roda a partir do horário, uma vez por dia', () => {
    expect(estaNaHora(a, null, sp('2026-10-14T19:59:00'))).toBe(false);
    expect(estaNaHora(a, sp('2026-10-13T20:05:00'), sp('2026-10-14T20:00:00'))).toBe(true);
    expect(estaNaHora(a, sp('2026-10-14T20:00:30'), sp('2026-10-14T21:00:00'))).toBe(false);
  });
  it('perdido (servidor fora às 20:00) roda quando voltar no mesmo dia', () => {
    expect(estaNaHora(a, sp('2026-10-13T20:05:00'), sp('2026-10-14T22:40:00'))).toBe(true);
  });
  it('rodada manual antes do horário não conta como a do dia', () => {
    expect(estaNaHora(a, sp('2026-10-14T11:00:00'), sp('2026-10-14T20:00:30'))).toBe(true);
  });
  it('próxima execução', () => {
    expect(proximaExecucao(a, sp('2026-10-14T20:01:00'), sp('2026-10-14T21:00:00'))).toEqual(sp('2026-10-15T20:00:00'));
    expect(proximaExecucao(a, sp('2026-10-13T20:01:00'), sp('2026-10-14T15:00:00'))).toEqual(sp('2026-10-14T20:00:00'));
  });
  it('dias da semana', () => {
    const b = ag({ tipo: 'diario', hora: '05:00', dias_semana: [1, 2, 3, 4, 5] });
    expect(estaNaHora(b, null, sp('2026-10-17T06:00:00'))).toBe(false); // sábado
    expect(proximaExecucao(b, null, sp('2026-10-17T06:00:00'))).toEqual(sp('2026-10-19T05:00:00'));
  });
});

describe('mensal e uma vez', () => {
  it('mensal só no dia', () => {
    const a = ag({ tipo: 'mensal', hora: '05:30', dia_mes: 5 });
    expect(estaNaHora(a, null, sp('2026-10-05T06:00:00'))).toBe(true);
    expect(estaNaHora(a, null, sp('2026-10-06T06:00:00'))).toBe(false);
    expect(proximaExecucao(a, sp('2026-10-05T05:31:00'), sp('2026-10-06T06:00:00'))).toEqual(sp('2026-11-05T05:30:00'));
  });
  it('uma vez roda só uma vez', () => {
    const a = ag({ tipo: 'uma_vez', executar_em: sp('2026-10-14T22:00:00').toISOString() });
    expect(estaNaHora(a, null, sp('2026-10-14T21:59:00'))).toBe(false);
    expect(estaNaHora(a, null, sp('2026-10-14T22:00:00'))).toBe(true);
    expect(estaNaHora(a, sp('2026-10-14T22:00:10'), sp('2026-10-14T22:05:00'))).toBe(false);
    expect(proximaExecucao(a, sp('2026-10-14T22:00:10'), sp('2026-10-14T22:05:00'))).toBeNull();
  });
  it('pausado nunca está na hora', () => {
    const a = ag({ tipo: 'intervalo', intervalo_min: 5, ativo: false });
    expect(estaNaHora(a, null, sp('2026-10-14T10:00:00'))).toBe(false);
    expect(proximaExecucao(a, null, sp('2026-10-14T10:00:00'))).toBeNull();
  });
});

describe('descrever e validar', () => {
  it('descreve', () => {
    expect(descreverQuando(ag({ tipo: 'intervalo', intervalo_min: 10, dias_semana: [1, 2, 3, 4, 5, 6], janela_inicio: '07:00', janela_fim: '20:00' })))
      .toBe('a cada 10 min · seg–sáb 07:00–20:00');
    expect(descreverQuando(ag({ tipo: 'intervalo', intervalo_min: 180 }))).toBe('a cada 3 h');
    expect(descreverQuando(ag({ tipo: 'diario', hora: '20:00' }))).toBe('diário 20:00');
    expect(descreverQuando(ag({ tipo: 'mensal', hora: '05:30', dia_mes: 5 }))).toBe('mensal dia 5 05:30');
    expect(descreverQuando(ag({ tipo: 'uma_vez', executar_em: sp('2026-10-14T22:00:00').toISOString() }))).toBe('uma vez 14/10 22:00');
  });
  it('valida', () => {
    expect(validarHorario(ag({ tipo: 'diario', hora: '20:00' }))).toBeNull();
    expect(validarHorario(ag({ tipo: 'diario', hora: '25:00' }))).toMatch(/HH:MM/);
    expect(validarHorario(ag({ tipo: 'intervalo', intervalo_min: 0 }))).toMatch(/Intervalo/);
    expect(validarHorario(ag({ tipo: 'intervalo', intervalo_min: 15, janela_inicio: '20:00', janela_fim: '07:00' }))).toMatch(/depois/);
    expect(validarHorario(ag({ tipo: 'mensal', hora: '05:00', dia_mes: 31 }))).toMatch(/1 a 28/);
    expect(validarHorario(ag({ tipo: 'semanal', hora: '05:00', dias_semana: [] }))).toMatch(/dia/);
  });
  it('falhou duas seguidas', () => {
    expect(falhouDuasSeguidas(['erro', 'erro', 'ok'])).toBe(true);
    expect(falhouDuasSeguidas(['rodando', 'erro', 'pulado', 'erro'])).toBe(true);
    expect(falhouDuasSeguidas(['erro', 'ok', 'erro'])).toBe(false);
    expect(falhouDuasSeguidas(['erro'])).toBe(false);
  });
});
