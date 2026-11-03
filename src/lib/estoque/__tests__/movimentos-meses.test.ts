import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
vi.mock('../omie', () => ({ omieRequest: vi.fn() }));

const { mesesRecentes } = await import('../movimentos-sync');

describe('mesesRecentes', () => {
  it('31/10 às 21:00 de Brasília (já 01/11 em UTC) continua em outubro', () => {
    expect(mesesRecentes(new Date('2026-11-01T00:00:00Z'))).toEqual([{ mes: 10, ano: 2026 }]);
  });

  it('na 1ª semana do mês inclui o mês anterior', () => {
    expect(mesesRecentes(new Date('2026-11-03T00:00:00Z'))).toEqual([{ mes: 11, ano: 2026 }, { mes: 10, ano: 2026 }]);
  });

  it('virada de ano', () => {
    expect(mesesRecentes(new Date('2027-01-02T12:00:00Z'))).toEqual([{ mes: 1, ano: 2027 }, { mes: 12, ano: 2026 }]);
  });

  it('meio do mês = só o mês corrente', () => {
    expect(mesesRecentes(new Date('2026-11-20T00:00:00Z'))).toEqual([{ mes: 11, ano: 2026 }]);
  });
});
