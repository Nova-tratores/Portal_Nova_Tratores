import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/pos/supabase', () => ({ supabase: {} }));
import { decidirTrava } from '../trava-concluida';

const base = { Status: 'Cobrando Cliente', Ordem_Omie: '000000000005368', faturado_omie_em: null, Servico_Interno: false };

describe('trava: Concluída só faturada', () => {
  it('sem envio ao Omie: recusa sem pedir motivo', () => {
    const r = decidirTrava({ ...base, Ordem_Omie: null }, 'qualquer motivo longo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.precisaMotivo).toBe(false);
  });
  it('faturada no portal: passa', () => {
    expect(decidirTrava({ ...base, faturado_omie_em: '2026-11-13T13:21:13Z' }, null)).toEqual({ ok: true });
  });
  it('serviço interno: passa (recibo/remessa)', () => {
    expect(decidirTrava({ ...base, Servico_Interno: true }, null)).toEqual({ ok: true });
  });
  it('não faturada e sem motivo: recusa e pede motivo, com o nº do Omie', () => {
    const r = decidirTrava(base, '');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.precisaMotivo).toBe(true); expect(r.erro).toContain('5368'); }
  });
  it('motivo curto: recusa', () => {
    const r = decidirTrava(base, 'curto');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/curto/);
  });
  it('motivo escrito: passa e devolve o motivo para o histórico', () => {
    expect(decidirTrava(base, '  faturada à mão no Omie da Castro  ')).toEqual({ ok: true, motivoLog: 'faturada à mão no Omie da Castro' });
  });
});
