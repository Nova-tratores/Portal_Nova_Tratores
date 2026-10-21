import { describe, it, expect } from 'vitest';
import { camposAtualizacaoItem, CHECKLIST_ITEMS } from '../checklist';

describe('item do checklist mensal', () => {
  const agora = '2026-10-19T15:00:00.000Z';

  it('sem foto nova, mantém a foto já salva (não manda foto_url/foto_tamanho)', () => {
    const c = camposAtualizacaoItem({ resposta: 'problema', observacao: 'risco na porta', fotoUrl: null, fotoTamanho: null, agora });
    expect(c).toEqual({ resposta: 'problema', observacao: 'risco na porta', respondido_em: agora });
    expect('foto_url' in c).toBe(false);
  });

  it('com foto nova, grava a foto e o tamanho', () => {
    const c = camposAtualizacaoItem({ resposta: 'ok', observacao: '', fotoUrl: 'https://x/y.jpg', fotoTamanho: 123456, agora });
    expect(c).toMatchObject({ foto_url: 'https://x/y.jpg', foto_tamanho: 123456, resposta: 'ok' });
  });

  it('são 25 itens com chave única (cada pneu com banda e lateral)', () => {
    expect(CHECKLIST_ITEMS).toHaveLength(25);
    expect(new Set(CHECKLIST_ITEMS.map((i) => i.key)).size).toBe(25);
  });
});
