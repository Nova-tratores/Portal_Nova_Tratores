import { describe, it, expect } from 'vitest';
import { calcular } from '../index';
import type { Calendario, EntradaMotor, TarefaIn, DepIn, Recurso } from '../tipos';

// ── helpers ───────────────────────────────────────────────────────────
// Semana de referência: 2026-06-01 é SEGUNDA.
//   seg 06-01, ter 06-02, qua 06-03, qui 06-04, sex 06-05
//   próximas quartas: 06-03, 06-10, 06-17, 06-24
const SEGSEX: Calendario = { id: 'segsex', diasSemana: [1, 2, 3, 4, 5], excecoes: [] };
const QUARTAS: Calendario = { id: 'quartas', diasSemana: [3], excecoes: [] };

function tarefa(id: string, p: Partial<TarefaIn> = {}): TarefaIn {
  return {
    id,
    duracaoDias: 1,
    restricao: 'asap',
    status: 'pendente',
    ...p,
  };
}

function dep(predecessoraId: string, sucessoraId: string, tipo: DepIn['tipo'], lagDias = 0): DepIn {
  return { predecessoraId, sucessoraId, tipo, lagDias };
}

function entrada(over: Partial<EntradaMotor>): EntradaMotor {
  return {
    inicioProjeto: '2026-06-01',
    calendarioPadraoId: 'segsex',
    tarefas: [],
    dependencias: [],
    recursos: [],
    calendarios: [SEGSEX],
    ...over,
  };
}

const byId = (s: ReturnType<typeof calcular>) =>
  new Map(s.tarefas.map((t) => [t.id, t]));

// ── 1. Cadeia linear A→B→C (FS), seg–sex: todas críticas ─────────────
describe('cadeia linear FS', () => {
  it('encadeia as datas e marca todas como críticas', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A'), tarefa('B'), tarefa('C')],
        dependencias: [dep('A', 'B', 'FS'), dep('B', 'C', 'FS')],
      }),
    );
    const m = byId(s);
    expect(m.get('A')).toMatchObject({ inicioCalc: '2026-06-01', fimCalc: '2026-06-01' });
    expect(m.get('B')).toMatchObject({ inicioCalc: '2026-06-02', fimCalc: '2026-06-02' });
    expect(m.get('C')).toMatchObject({ inicioCalc: '2026-06-03', fimCalc: '2026-06-03' });
    expect(s.fimProjeto).toBe('2026-06-03');
    expect(s.tarefas.every((t) => t.eCritica)).toBe(true);
    expect(s.erros).toHaveLength(0);
  });
});

// ── 2. Diamante: ramo longo crítico, ramo curto com folga ────────────
describe('diamante', () => {
  it('só o ramo mais longo é crítico', () => {
    const s = calcular(
      entrada({
        tarefas: [
          tarefa('A', { duracaoDias: 1 }),
          tarefa('B', { duracaoDias: 2 }),
          tarefa('C', { duracaoDias: 1 }),
          tarefa('D', { duracaoDias: 1 }),
        ],
        dependencias: [
          dep('A', 'B', 'FS'),
          dep('A', 'C', 'FS'),
          dep('B', 'D', 'FS'),
          dep('C', 'D', 'FS'),
        ],
      }),
    );
    const m = byId(s);
    expect(m.get('A')!.eCritica).toBe(true);
    expect(m.get('B')!.eCritica).toBe(true);
    expect(m.get('D')!.eCritica).toBe(true);
    expect(m.get('C')!.eCritica).toBe(false);
    expect(m.get('C')!.folgaDias).toBe(1);
    expect(s.fimProjeto).toBe('2026-06-04');
  });
});

// ── 3. Calendário "só quartas": 3 dias → três quartas depois (pintor) ─
describe('calendário só quartas', () => {
  it('tarefa de 3 dias começando na segunda termina na terceira quarta', () => {
    const rec: Recurso = { id: 'pintor', calendarioId: 'quartas' };
    const s = calcular(
      entrada({
        tarefas: [tarefa('P', { duracaoDias: 3, recursoId: 'pintor' })],
        recursos: [rec],
        calendarios: [SEGSEX, QUARTAS],
      }),
    );
    const p = byId(s).get('P')!;
    expect(p.inicioCalc).toBe('2026-06-03'); // 1ª quarta
    expect(p.fimCalc).toBe('2026-06-17'); // 3ª quarta
  });
});

// ── 4. Lag positivo e negativo em FS ─────────────────────────────────
describe('lag em FS', () => {
  it('lag +2 abre uma folga de dois dias úteis', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A'), tarefa('B')],
        dependencias: [dep('A', 'B', 'FS', 2)],
      }),
    );
    // A termina 06-01; +2 dias úteis de gap → B começa 06-04
    expect(byId(s).get('B')!.inicioCalc).toBe('2026-06-04');
  });

  it('lag -1 faz a sucessora começar no dia em que a predecessora termina', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A'), tarefa('B')],
        dependencias: [dep('A', 'B', 'FS', -1)],
      }),
    );
    expect(byId(s).get('B')!.inicioCalc).toBe('2026-06-01');
  });
});

// ── 5. SS, FF e SF ───────────────────────────────────────────────────
describe('tipos de dependência', () => {
  it('SS: sucessora começa junto com a predecessora', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A', { duracaoDias: 2 }), tarefa('B')],
        dependencias: [dep('A', 'B', 'SS')],
      }),
    );
    const m = byId(s);
    expect(m.get('B')!.inicioCalc).toBe(m.get('A')!.inicioCalc);
    expect(m.get('B')!.inicioCalc).toBe('2026-06-01');
  });

  it('FF: sucessora termina junto com a predecessora', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A', { duracaoDias: 2 }), tarefa('B')],
        dependencias: [dep('A', 'B', 'FF')],
      }),
    );
    const m = byId(s);
    expect(m.get('B')!.fimCalc).toBe(m.get('A')!.fimCalc);
    expect(m.get('B')!.fimCalc).toBe('2026-06-02');
  });

  it('SF: sucessora termina quando a predecessora começa', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A'), tarefa('B')],
        dependencias: [dep('A', 'B', 'SF')],
      }),
    );
    const m = byId(s);
    expect(m.get('B')!.fimCalc).toBe(m.get('A')!.inicioCalc);
  });
});

// ── 6. em_andamento com inicioReal ancora e empurra sucessoras ───────
describe('âncora em execução real', () => {
  it('respeita o inicioReal e empurra as sucessoras', () => {
    const s = calcular(
      entrada({
        tarefas: [
          tarefa('A', { duracaoDias: 2, status: 'em_andamento', inicioReal: '2026-06-08' }),
          tarefa('B'),
        ],
        dependencias: [dep('A', 'B', 'FS')],
      }),
    );
    const m = byId(s);
    expect(m.get('A')!.inicioCalc).toBe('2026-06-08'); // não volta ao início do projeto
    expect(m.get('A')!.fimCalc).toBe('2026-06-09');
    expect(m.get('B')!.inicioCalc).toBe('2026-06-10');
  });
});

// ── 7. Ciclo A→B→A → erro, sem datas ─────────────────────────────────
describe('ciclo', () => {
  it('detecta o ciclo e não devolve datas', () => {
    const s = calcular(
      entrada({
        tarefas: [tarefa('A'), tarefa('B')],
        dependencias: [dep('A', 'B', 'FS'), dep('B', 'A', 'FS')],
      }),
    );
    expect(s.erros.some((e) => e.tipo === 'ciclo')).toBe(true);
    expect(s.tarefas).toHaveLength(0);
  });
});

// ── 8. Feriado dentro de uma tarefa empurra o fim em 1 dia útil ──────
describe('exceção de feriado', () => {
  it('um feriado no meio empurra o fim em um dia útil', () => {
    const calComFeriado: Calendario = {
      id: 'segsex',
      diasSemana: [1, 2, 3, 4, 5],
      excecoes: [{ data: '2026-06-03', tipo: 'folga' }], // quarta vira folga
    };
    const semFeriado = calcular(
      entrada({ tarefas: [tarefa('T', { duracaoDias: 3 })] }),
    );
    const comFeriado = calcular(
      entrada({ tarefas: [tarefa('T', { duracaoDias: 3 })], calendarios: [calComFeriado] }),
    );
    expect(byId(semFeriado).get('T')!.fimCalc).toBe('2026-06-03');
    expect(byId(comFeriado).get('T')!.fimCalc).toBe('2026-06-04'); // pulou o feriado
  });
});
