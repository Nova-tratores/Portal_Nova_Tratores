import { describe, expect, it } from 'vitest';
import { cfopRemessaGarantia, divergenciasItemGarantia, fiscalItemGarantia, freteCerto } from '../remessa-garantia';

describe('remessa de garantia', () => {
  it('CFOP 5.949 em SP e 6.949 fora', () => {
    expect(cfopRemessaGarantia('SP')).toBe('5.949');
    expect(cfopRemessaGarantia('sp ')).toBe('5.949');
    expect(cfopRemessaGarantia('PR')).toBe('6.949');
    expect(cfopRemessaGarantia('')).toBe('5.949');
  });

  it('item vai em CST 60 sem benefício fiscal', () => {
    const f = fiscalItemGarantia('MG');
    expect(f.cCFOP).toBe('6.949');
    expect(f.ICMS.cSitTrib).toBe('60');
    expect(f.infAdicItem.codigo_benef).toBe('');
  });

  it('aponta o que está errado no item gravado (caso da remessa 3797)', () => {
    const d = divergenciasItemGarantia({ cCFOP: '5.910', ICMS: { cSitTrib: '51' }, infAdicItem: { codigo_benef: '' } }, 'SP');
    expect(d).toHaveLength(2);
    expect(divergenciasItemGarantia({ cCFOP: '5.949', ICMS: { cSitTrib: '60' }, infAdicItem: { codigo_benef: '' } }, 'SP')).toEqual([]);
  });

  it('frete por conta do remetente (3)', () => {
    expect(freteCerto('3')).toBe(true);
    expect(freteCerto('9')).toBe(false);
  });
});
