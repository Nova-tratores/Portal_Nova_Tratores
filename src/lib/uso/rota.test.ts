import { describe, it, expect } from 'vitest';
import { normalizarRota, moduloDaRota, ehRotaAutomatica, diaLocal } from './rota';

describe('normalizarRota', () => {
  it('descarta query string e hash', () => {
    expect(normalizarRota('/clientes?cod=123&doc=00.000.000/0001-00#x')).toBe('/clientes');
  });
  it('troca número, uuid, código e token por marcador', () => {
    expect(normalizarRota('/tickets/42')).toBe('/tickets/[id]');
    expect(normalizarRota('/pos/OS-0777')).toBe('/pos/[id]');
    expect(normalizarRota('/api/pos/ordens/123/cheque')).toBe('/api/pos/ordens/[id]/cheque');
    expect(normalizarRota('/marketing/3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe('/marketing/[id]');
    expect(normalizarRota('/conhecimento/editar/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe('/conhecimento/editar/[id]');
  });
  it('caudas dinâmicas conhecidas', () => {
    expect(normalizarRota('/feedbacks/atendimento/omie-98765')).toBe('/feedbacks/atendimento/[clienteKey]');
    expect(normalizarRota('/cheque/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_')).toBe('/cheque/[token]');
    expect(normalizarRota('/q/abc')).toBe('/q/[token]');
    expect(normalizarRota('/agro/imovel/SP-3538808-ABCD')).toBe('/agro/imovel/[cod]');
  });
  it('mantém rotas estáticas e barra final fora', () => {
    expect(normalizarRota('/estoque/notas-entrada/')).toBe('/estoque/notas-entrada');
    expect(normalizarRota('/dre-financeiro/vendas-modelo')).toBe('/dre-financeiro/vendas-modelo');
    expect(normalizarRota('/dashboard-agro')).toBe('/dashboard-agro');
  });
  it('ignora internos, estáticos, login e raiz', () => {
    expect(normalizarRota('/_next/static/x.js')).toBe('');
    expect(normalizarRota('/Logo_Nova.png')).toBe('');
    expect(normalizarRota('/login')).toBe('');
    expect(normalizarRota('/')).toBe('');
    expect(normalizarRota('')).toBe('');
  });
  it('corta em 200 caracteres', () => {
    expect(normalizarRota('/' + 'abc-'.repeat(80)).length).toBe(200);
    // sequência hexadecimal longa é id (hash), não rota
    expect(normalizarRota('/x/' + 'a'.repeat(32))).toBe('/x/[id]');
  });
});

describe('moduloDaRota / ehRotaAutomatica / diaLocal', () => {
  it('módulo = 1º segmento; api = api:x', () => {
    expect(moduloDaRota('/estoque/notas-entrada')).toBe('estoque');
    expect(moduloDaRota('/api/estoque/notas-entrada')).toBe('api:estoque');
    expect(moduloDaRota('')).toBe('');
  });
  it('rotas de polling são automáticas', () => {
    expect(ehRotaAutomatica('/api/notificacoes')).toBe(true);
    expect(ehRotaAutomatica('/api/financeiro/caixa-email')).toBe(true);
    expect(ehRotaAutomatica('/api/estoque/notas-entrada')).toBe(false);
  });
  it('diaLocal usa -03:00', () => {
    expect(diaLocal(new Date('2026-10-07T01:30:00Z'))).toBe('2026-10-06');
    expect(diaLocal(new Date('2026-10-07T12:00:00Z'))).toBe('2026-10-07');
  });
});
