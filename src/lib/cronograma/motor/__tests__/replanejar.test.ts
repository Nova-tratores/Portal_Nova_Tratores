import { describe, it, expect } from 'vitest';
import { calcular } from '../index';
import type { Calendario, EntradaMotor, TarefaIn } from '../tipos';

// 2026-06-01 é segunda. Replanejamento = entrada.hoje preenchido.
const SEGSEX: Calendario = { id: 'segsex', diasSemana: [1, 2, 3, 4, 5], excecoes: [] };
const t = (id: string, p: Partial<TarefaIn> = {}): TarefaIn => ({ id, duracaoDias: 1, restricao: 'asap', status: 'pendente', ...p });
const entrada = (over: Partial<EntradaMotor>): EntradaMotor => ({
  inicioProjeto: '2026-06-01', calendarioPadraoId: 'segsex', tarefas: [], dependencias: [], recursos: [], calendarios: [SEGSEX], ...over,
});
const porId = (s: ReturnType<typeof calcular>) => new Map(s.tarefas.map((x) => [x.id, x]));

describe('replanejamento automático (entrada.hoje)', () => {
  const tarefas = [
    t('A', { status: 'em_andamento', inicioReal: '2026-06-01', duracaoDias: 2 }), // previsto 01–02
    t('B', { duracaoDias: 2 }),
  ];
  const dependencias = [{ predecessoraId: 'A', sucessoraId: 'B', tipo: 'FS' as const, lagDias: 0 }];

  it('sem hoje, o motor é o de sempre', () => {
    const m = porId(calcular(entrada({ tarefas, dependencias })));
    expect(m.get('A')!.fimCalc).toBe('2026-06-02');
    expect(m.get('B')!.inicioCalc).toBe('2026-06-03');
  });

  it('etapa em andamento atrasada vai até hoje e empurra a seguinte', () => {
    const m = porId(calcular(entrada({ tarefas, dependencias, hoje: '2026-06-04' })));
    expect(m.get('A')!.fimCalc).toBe('2026-06-04');
    expect(m.get('B')!.inicioCalc).toBe('2026-06-05');
    expect(m.get('B')!.fimCalc).toBe('2026-06-08'); // pula o fim de semana
  });

  it('etapa que não começou não fica no passado', () => {
    const m = porId(calcular(entrada({ tarefas: [t('X', { duracaoDias: 1 })], hoje: '2026-06-10' })));
    expect(m.get('X')!.inicioCalc).toBe('2026-06-10');
  });

  it('etapa em andamento dentro do prazo não muda', () => {
    const m = porId(calcular(entrada({ tarefas, dependencias, hoje: '2026-06-02' })));
    expect(m.get('A')!.fimCalc).toBe('2026-06-02');
  });

  it('concluída fica nas datas reais', () => {
    const m = porId(calcular(entrada({ tarefas: [t('C', { status: 'concluida', inicioReal: '2026-06-01', fimReal: '2026-06-01' })], hoje: '2026-06-10' })));
    expect(m.get('C')!.inicioCalc).toBe('2026-06-01');
  });
});
