import { describe, expect, it } from 'vitest';
import { avaliarPedido } from '../painel/proxy';

const p = (q = '') => new URLSearchParams(q);

describe('rota de dados do Dashboard Agro', () => {
  it('lê as tabelas da lista', () => {
    expect(avaliarPedido('GET', ['v1', 'lupa_maquinas'], p('select=*&limit=10'))).toEqual({ ok: true, caminho: 'lupa_maquinas' });
    expect(avaliarPedido('GET', ['v1', 'tratores'], p('select=Modelo,Cidade')).ok).toBe(true);
  });

  it('nega tabela fora da lista', () => {
    for (const t of ['finan_pagar', 'portal_permissoes', 'financeiro_usu', 'Formulario']) {
      expect(avaliarPedido('GET', ['v1', t], p()).ok).toBe(false);
    }
  });

  it('nega select que embute outra tabela (a rota usa service role)', () => {
    expect(avaliarPedido('GET', ['v1', 'tratores'], p('select=*,financeiro_usu(*)')).ok).toBe(false);
  });

  it('funções: só POST e só as da lista', () => {
    expect(avaliarPedido('POST', ['v1', 'rpc', 'lupa_rank_maquina'], p())).toEqual({ ok: true, caminho: 'rpc/lupa_rank_maquina' });
    expect(avaliarPedido('POST', ['v1', 'rpc', 'perm_efetivas'], p()).ok).toBe(false);
    expect(avaliarPedido('GET', ['v1', 'rpc', 'lupa_rank_maquina'], p()).ok).toBe(false);
  });

  it('só municipio_pontos aceita gravação, e só por upsert fixo', () => {
    expect(avaliarPedido('POST', ['v1', 'municipio_pontos'], p()))
      .toEqual({ ok: true, caminho: 'municipio_pontos', prefer: 'resolution=merge-duplicates,return=minimal' });
    expect(avaliarPedido('POST', ['v1', 'lupa_maquinas'], p()).ok).toBe(false);
    expect(avaliarPedido('PATCH', ['v1', 'municipio_pontos'], p()).ok).toBe(false);
    expect(avaliarPedido('DELETE', ['v1', 'pecuaria'], p()).ok).toBe(false);
  });

  it('nega caminho estranho', () => {
    expect(avaliarPedido('GET', ['v2', 'tratores'], p()).ok).toBe(false);
    expect(avaliarPedido('GET', ['v1', 'tratores', 'x'], p()).ok).toBe(false);
    expect(avaliarPedido('GET', ['v1'], p()).ok).toBe(false);
  });
});
