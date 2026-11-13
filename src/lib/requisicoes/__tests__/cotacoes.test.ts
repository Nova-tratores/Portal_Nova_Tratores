import { describe, it, expect } from 'vitest';
import {
  cotacoesPreenchidas, removerCotacaoShift, precisaMarcarComprada, aderencia, linkSeguro, dominioDoLink,
  erroColunaFaltando, semColunasNovas,
} from '../cotacoes';

const mapa = {
  fornecedor1: 'A', valor1: '10', link1: 'a.com', anexo1: 'x.pdf',
  fornecedor2: 'B', valor2: '20', link2: 'b.com',
  fornecedor3: 'C', valor3: '30',
  indicada: 3, indicada_por: 'Ana', comprada: 1, comprada_por: 'Bia',
};

describe('cotacoes', () => {
  it('lista as preenchidas', () => {
    expect(cotacoesPreenchidas(mapa)).toEqual([1, 2, 3]);
    expect(cotacoesPreenchidas(null)).toEqual([]);
    expect(cotacoesPreenchidas({ valor4: '5' })).toEqual([4]);
  });

  it('remover desloca campos e a indicada acompanha', () => {
    const r = removerCotacaoShift(mapa, 2);
    expect(r.fornecedor2).toBe('C');
    expect(r.link2).toBeNull();
    expect(r.fornecedor3).toBe('');
    expect(r.indicada).toBe(2);
    expect(r.comprada).toBe(1);
    expect(r.link1).toBe('a.com');
  });

  it('remover a indicada/comprada limpa a marca', () => {
    const r = removerCotacaoShift(mapa, 1);
    expect(r.comprada).toBeNull();
    expect(r.comprada_por).toBeNull();
    expect(r.indicada).toBe(2);
    expect(r.fornecedor1).toBe('B');
  });

  it('remover sem colunas novas não cria indicada', () => {
    const r = removerCotacaoShift({ fornecedor1: 'A', fornecedor2: 'B' }, 1);
    expect('indicada' in r).toBe(false);
    expect(r.fornecedor1).toBe('B');
  });

  it('precisa marcar comprada só com nota e 2+ cotações', () => {
    const sem = { ...mapa, comprada: null };
    expect(precisaMarcarComprada(sem, { foto_nf: 'n.pdf' })).toBe(true);
    expect(precisaMarcarComprada(sem, { foto_nf3: 'n.pdf' })).toBe(true);
    expect(precisaMarcarComprada(sem, { boleto_fornecedor: 'b.pdf' })).toBe(false);
    expect(precisaMarcarComprada(mapa, { foto_nf: 'n.pdf' })).toBe(false);
    expect(precisaMarcarComprada({ fornecedor1: 'A' }, { foto_nf: 'n.pdf' })).toBe(false);
  });

  it('aderência', () => {
    expect(aderencia(mapa)).toBe('outra');
    expect(aderencia({ indicada: 2, comprada: 2 })).toBe('seguiu');
    expect(aderencia({ comprada: 2 })).toBe('sem_indicada');
    expect(aderencia({ indicada: 2 })).toBe('sem_comprada');
  });

  it('link seguro', () => {
    expect(linkSeguro('loja.com.br/p/1')).toBe('https://loja.com.br/p/1');
    expect(linkSeguro('http://x.com')).toBe('http://x.com/');
    expect(linkSeguro('javascript:alert(1)')).toBeNull();
    expect(linkSeguro('')).toBeNull();
    expect(dominioDoLink('https://www.mercadolivre.com.br/item')).toBe('mercadolivre.com.br');
  });

  it('coluna faltando', () => {
    expect(erroColunaFaltando({ code: 'PGRST204' })).toBe(true);
    expect(erroColunaFaltando({ message: "Could not find the 'link1' column of 'req_cotacao'" })).toBe(true);
    expect(erroColunaFaltando({ code: '23505' })).toBe(false);
    expect(semColunasNovas({ id: 1, link1: 'x', indicada: 2, fornecedor1: 'A' })).toEqual({ id: 1, fornecedor1: 'A' });
  });
});
