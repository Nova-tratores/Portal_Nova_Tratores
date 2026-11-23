import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: {} }));
vi.mock('../redes/server', () => ({ avisarPedido: async () => {} }));
import { minutosComerciais } from '../leads-alerta';

// horários em Brasília (UTC−3)
const br = (s: string) => new Date(`${s}-03:00`);

describe('minutosComerciais', () => {
  it('segunda 9h → 10h30 = 90 min', () => {
    expect(minutosComerciais(br('2026-11-23T09:00:00'), br('2026-11-23T10:30:00'))).toBe(90);
  });
  it('sexta 17h30 → segunda 8h30 = 300 min (30 de sexta + 240 do sábado + 30 de segunda)', () => {
    // sexta 27/11 17:30–18:00 (30) + sábado 28/11 8–12 (240) + segunda 30/11 8:00–8:30 (30)
    expect(minutosComerciais(br('2026-11-27T17:30:00'), br('2026-11-30T08:30:00'))).toBe(300);
  });
  it('domingo inteiro não conta', () => {
    expect(minutosComerciais(br('2026-11-29T00:00:00'), br('2026-11-29T23:45:00'))).toBe(0);
  });
  it('lead às 22h só começa a contar às 8h', () => {
    expect(minutosComerciais(br('2026-11-23T22:00:00'), br('2026-11-24T08:45:00'))).toBe(45);
  });
});
