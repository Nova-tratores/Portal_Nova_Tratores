import { describe, expect, it } from 'vitest';
import { fotoForaDoCatalogo, slugCatalogoDoModelo } from '../foto-modelo';

describe('modelo → foto do catálogo', () => {
  it('jeitos reais de escrever o modelo', () => {
    expect(slugCatalogoDoModelo('6075E CAB')).toBe('6075-p2');
    expect(slugCatalogoDoModelo('6075 E')).toBe('6075-p2');
    expect(slugCatalogoDoModelo('Mahindra 6075E-BR-CAB PH2')).toBe('6075-p2');
    expect(slugCatalogoDoModelo('6075 P1')).toBe('6075-p1');
    expect(slugCatalogoDoModelo('6075L')).toBe('6075l');
    expect(slugCatalogoDoModelo('Mahindra Jivo')).toBe('jivo-2025');
    expect(slugCatalogoDoModelo('2025')).toBe('jivo-2025');
    expect(slugCatalogoDoModelo('5050 4WD')).toBe('5050');
    expect(slugCatalogoDoModelo('6065-BR-CAB PH2')).toBe('6065');
    expect(slugCatalogoDoModelo('9500S T3')).toBe('8000s-9500s');
    expect(slugCatalogoDoModelo('86-110')).toBe('86-110');
  });
  it('modelo que o catálogo não tem', () => {
    expect(slugCatalogoDoModelo('Mahindra 7095')).toBeNull();
    expect(slugCatalogoDoModelo('')).toBeNull();
  });
  it('7095 tem foto fora do catálogo', () => {
    expect(fotoForaDoCatalogo('Mahindra 7095')).toBe('modelo/7095.png');
    expect(fotoForaDoCatalogo('6075E CAB')).toBeNull();
    expect(fotoForaDoCatalogo('Mahindra OJA 3140')).toBe('modelo/oja-3140.png');
    expect(fotoForaDoCatalogo('YTO ESK304')).toBe('modelo/yto-esk304.jpg');
  });
});
