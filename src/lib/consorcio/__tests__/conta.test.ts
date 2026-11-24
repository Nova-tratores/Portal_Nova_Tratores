// Confere a conta contra a tabela oficial do grupo 6008 (dez/2026) e a proposta de R$ 139.700.
import { describe, it, expect } from 'vitest';
import { lerConfig, parcela, porDia, creditoComEmbutido, totalComTaxas, numeroSorte } from '../conta';

const cfg = lerConfig({ prazo_meses: 120, taxa_adm_pct: 15, fundo_reserva_pct: 1, seguro_pct: 0.084, lance_embutido_pct: 20 });
const cent = (v: number) => Math.round(v * 100) / 100;

describe('consórcio grupo 6008', () => {
  it('Mahindra 2025 25cv (R$ 146.685): parcela 1.560,88 · 52,03/dia · 112.654 com embutido', () => {
    expect(cent(parcela(146685, cfg))).toBe(1560.88);
    expect(cent(porDia(146685, cfg))).toBe(52.03);
    expect(Math.round(creditoComEmbutido(146685, cfg))).toBe(112654);
  });
  it('Mahindra 5050 (R$ 181.286): parcela 1.929,08 · 64,30/dia · 139.228 com embutido', () => {
    expect(cent(parcela(181286, cfg))).toBe(1929.08);
    expect(cent(porDia(181286, cfg))).toBe(64.3);
    expect(Math.round(creditoComEmbutido(181286, cfg))).toBe(139228);
  });
  it('proposta de R$ 139.700: parcela 1.486,56 e lance embutido de 20% = 32.410,40', () => {
    expect(cent(parcela(139700, cfg))).toBe(1486.56);
    expect(cent(totalComTaxas(139700, cfg) * 0.2)).toBe(32410.4);
  });
  it('número da sorte sempre com 3 dígitos', () => {
    expect(numeroSorte(7)).toBe('007');
    expect(numeroSorte(1234)).toBe('1234');
  });
  it('config vazia cai no padrão', () => {
    expect(lerConfig(null).prazo_meses).toBe(120);
  });
});
