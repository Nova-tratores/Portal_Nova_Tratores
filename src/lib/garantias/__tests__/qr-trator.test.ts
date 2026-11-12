import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import {
  ALFABETO_CODIGO, CORRECAO_QR, conteudoQR, finalPublico, gerarCodigo, limparBusca,
  nomeLote, normalizarCodigo, quantidadeLote, revisoesFeitas, svgAdesivo,
} from '../qr-trator';

describe('código do trator', () => {
  it('gera 6 caracteres do alfabeto sem letras confusas', () => {
    let i = 0;
    const c = gerarCodigo((n) => (i++ * 7) % n);
    expect(c).toHaveLength(6);
    expect([...c].every((x) => ALFABETO_CODIGO.includes(x))).toBe(true);
    expect(ALFABETO_CODIGO).not.toMatch(/[01OILSBZ5]/);
  });

  it('normaliza a caixa e recusa o que não é código', () => {
    expect(normalizarCodigo('k7p2qx')).toBe('K7P2QX');
    expect(normalizarCodigo('K7P2Q')).toBeNull();
    expect(normalizarCodigo('K7P2Q0')).toBeNull();
    expect(normalizarCodigo('sw.js')).toBeNull();
  });

  it('o QR cabe em 29 × 29 com correção Q', () => {
    const q = QRCode.create(conteudoQR('YYYYYY'), { errorCorrectionLevel: CORRECAO_QR });
    expect(q.modules.size).toBe(29);
  });
});

describe('adesivo', () => {
  it('SVG de 30 mm com o QR centralizado', () => {
    const q = QRCode.create(conteudoQR('K7P2QX'), { errorCorrectionLevel: CORRECAO_QR });
    const n = q.modules.size;
    const m: boolean[][] = Array.from({ length: n }, (_, l) => Array.from({ length: n }, (_, c) => !!q.modules.data[l * n + c]));
    const svg = svgAdesivo(m);
    expect(svg).toContain('width="30mm"');
    // margem = (30 − 29 × 0,875) / 2 = 2,3125 — o 1º módulo (canto do localizador) começa nela
    expect(svg).toContain('M2.3125 2.3125');
  });

  it('recusa QR que não cabe', () => {
    const grande = Array.from({ length: 40 }, () => Array(40).fill(true));
    expect(() => svgAdesivo(grande)).toThrow();
  });
});

describe('auxiliares', () => {
  it('final público tem só 4 caracteres', () => {
    expect(finalPublico('MDI07511L50005208')).toBe('5208');
  });
  it('busca sem caracteres do filtro', () => {
    expect(limparBusca('a,(b)%*')).toBe('a b');
  });
  it('revisões únicas e ordenadas', () => {
    expect(revisoesFeitas(['300', '50', '300h', null, 'x'])).toEqual([50, 300]);
  });
});

describe('lote', () => {
  it('quantidade entre 1 e 500', () => {
    expect(quantidadeLote(100)).toBe(100);
    expect(quantidadeLote('100')).toBe(100);
    expect(quantidadeLote(0)).toBeNull();
    expect(quantidadeLote(501)).toBeNull();
    expect(quantidadeLote(2.5)).toBeNull();
  });
  it('nome do lote no horário de Brasília', () => {
    expect(nomeLote(new Date('2026-11-12T18:30:00Z'))).toBe('L-20261112-1530');
  });
});
