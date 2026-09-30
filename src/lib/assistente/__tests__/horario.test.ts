import { describe, it, expect } from 'vitest';
import { dentroDoHorario, feriadosNacionais, mensagemForaDoHorario, pascoa, proximaAbertura, localSP } from '../horario';

// helper: instante em São Paulo (UTC-3, sem horário de verão desde 2019)
const sp = (iso: string) => new Date(`${iso}:00-03:00`);
const semExtras = new Set<string>();

describe('horário de atendimento (seg–sex 07:30–11:30 / 12:30–17:30)', () => {
  it('dentro dos turnos', () => {
    expect(dentroDoHorario(sp('2026-09-30T07:30'), semExtras)).toBe(true);   // quarta
    expect(dentroDoHorario(sp('2026-09-30T11:29'), semExtras)).toBe(true);
    expect(dentroDoHorario(sp('2026-09-30T12:30'), semExtras)).toBe(true);
    expect(dentroDoHorario(sp('2026-09-30T17:29'), semExtras)).toBe(true);
  });
  it('fora: almoço, antes de abrir, depois de fechar, fim de semana', () => {
    expect(dentroDoHorario(sp('2026-09-30T11:30'), semExtras)).toBe(false);
    expect(dentroDoHorario(sp('2026-09-30T12:00'), semExtras)).toBe(false);
    expect(dentroDoHorario(sp('2026-09-30T07:29'), semExtras)).toBe(false);
    expect(dentroDoHorario(sp('2026-09-30T17:30'), semExtras)).toBe(false);
    expect(dentroDoHorario(sp('2026-10-03T10:00'), semExtras)).toBe(false); // sábado
    expect(dentroDoHorario(sp('2026-10-04T10:00'), semExtras)).toBe(false); // domingo
  });
  it('feriados nacionais fixos e móveis', () => {
    expect(pascoa(2026)).toEqual({ mes: 4, dia: 5 });
    const f = feriadosNacionais(2026);
    expect(f.has('2026-02-16')).toBe(true); // seg de Carnaval
    expect(f.has('2026-02-17')).toBe(true); // ter de Carnaval
    expect(f.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(f.has('2026-06-04')).toBe(true); // Corpus Christi
    expect(f.has('2026-11-20')).toBe(true); // Consciência Negra
    expect(dentroDoHorario(sp('2026-10-12T10:00'), semExtras)).toBe(false); // N. Sra. Aparecida (segunda)
    expect(dentroDoHorario(sp('2026-10-13T10:00'), semExtras)).toBe(true);
  });
  it('feriado extra (municipal) por lista', () => {
    expect(dentroDoHorario(sp('2026-10-13T10:00'), new Set(['2026-10-13']))).toBe(false);
  });
  it('próxima abertura', () => {
    expect(proximaAbertura(sp('2026-09-30T06:00'), semExtras)).toBe('hoje às 7h30');
    expect(proximaAbertura(sp('2026-09-30T12:00'), semExtras)).toBe('hoje às 12h30');
    expect(proximaAbertura(sp('2026-09-30T19:00'), semExtras)).toBe('amanhã às 7h30');
    expect(proximaAbertura(sp('2026-10-02T19:00'), semExtras)).toBe('segunda-feira às 7h30'); // sexta à noite
    expect(proximaAbertura(sp('2026-10-03T10:00'), semExtras)).toBe('segunda-feira às 7h30'); // sábado
  });
  it('mensagem fora do horário', () => {
    const m = mensagemForaDoHorario('Tereza ADM', sp('2026-09-30T19:00'), semExtras);
    expect(m.startsWith('Boa noite, Tereza!')).toBe(true);
    expect(m).toContain('7h30 às 11h30 e das 12h30 às 17h30');
    expect(m).toContain('amanhã às 7h30');
    expect(localSP(sp('2026-09-30T19:00')).minutos).toBe(19 * 60);
  });
});
