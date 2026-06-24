import { describe, it, expect } from 'vitest';
import { detectarConflitos, type TarefaCarga, type AlocacaoCarga } from '../conflitos';

const t = (id: string, inicio: string, fim: string, recursoId: string | null = null): TarefaCarga =>
  ({ id, nome: id, inicio, fim, recursoId });

describe('detectarConflitos', () => {
  it('mesmo recurso 100%+100% sobrepostos → conflito nos dias de overlap', () => {
    const tarefas = [t('A', '2026-06-01', '2026-06-05', 'r1'), t('B', '2026-06-03', '2026-06-07', 'r1')];
    const { porRecurso, tarefasEmConflito } = detectarConflitos(tarefas, []);
    expect(porRecurso).toHaveLength(1);
    expect(porRecurso[0].recursoId).toBe('r1');
    expect(porRecurso[0].dias.map((d) => d.data)).toEqual(['2026-06-03', '2026-06-04', '2026-06-05']);
    expect(porRecurso[0].dias[0].total).toBe(200);
    expect(tarefasEmConflito.has('A')).toBe(true);
    expect(tarefasEmConflito.has('B')).toBe(true);
  });

  it('50%+50% no mesmo dia NÃO é conflito (soma = 100)', () => {
    const tarefas = [t('A', '2026-06-01', '2026-06-05', 'r1'), t('B', '2026-06-03', '2026-06-07', 'r1')];
    const aloc: AlocacaoCarga[] = [
      { tarefaId: 'A', recursoId: 'r1', percentual: 50 },
      { tarefaId: 'B', recursoId: 'r1', percentual: 50 },
    ];
    expect(detectarConflitos(tarefas, aloc).porRecurso).toHaveLength(0);
  });

  it('tarefas que não se sobrepõem não conflitam', () => {
    const tarefas = [t('A', '2026-06-01', '2026-06-02', 'r1'), t('B', '2026-06-03', '2026-06-04', 'r1')];
    expect(detectarConflitos(tarefas, []).porRecurso).toHaveLength(0);
  });

  it('recursos diferentes não conflitam entre si', () => {
    const tarefas = [t('A', '2026-06-01', '2026-06-05', 'r1'), t('B', '2026-06-01', '2026-06-05', 'r2')];
    expect(detectarConflitos(tarefas, []).porRecurso).toHaveLength(0);
  });
});
