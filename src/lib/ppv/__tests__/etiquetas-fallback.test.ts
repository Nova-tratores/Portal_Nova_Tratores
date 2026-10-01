import { describe, it, expect } from 'vitest';
import { indexarProdutos, mesclarFallbackBusca, normalizarConta, pecaElegivel, produtoParaItem } from '../etiquetas-fallback';

const peca = (over: Partial<Parameters<typeof pecaElegivel>[0]> = {}) => ({
  conta_omie: 'castro', codigo: '000135', codigo_produto: 123, descricao: 'Arruela Pressao 1/2', familia_nome: 'Peças', inativo: false, ...over,
});

describe('etiquetas-fallback', () => {
  it('normaliza a conta minúscula do espelho produtos', () => {
    expect(normalizarConta('castro')).toBe('CASTRO');
    expect(normalizarConta(' nova ')).toBe('NOVA');
    expect(normalizarConta(null)).toBe('');
  });

  it('elegível = peça ativa da família Peças ou sem família (máquina fica fora)', () => {
    expect(pecaElegivel(peca())).toBe(true);
    expect(pecaElegivel(peca({ familia_nome: 'PEÇAS' }))).toBe(true);
    expect(pecaElegivel(peca({ familia_nome: null }))).toBe(true);
    expect(pecaElegivel(peca({ familia_nome: '#N/D' }))).toBe(true);
    expect(pecaElegivel(peca({ familia_nome: 'Trator Novo' }))).toBe(false);
    expect(pecaElegivel(peca({ inativo: true }))).toBe(false);
  });

  it('converte produto em item sem características e marcado como fallback', () => {
    expect(produtoParaItem(peca(), '30/09/2026')).toEqual({
      conta_omie: 'CASTRO', codigo: '000135', descricao: 'Arruela Pressao 1/2', caracteristicas: null, chegou: '30/09/2026', origem: 'produtos',
    });
    expect(produtoParaItem(peca())).not.toHaveProperty('chegou');
    expect(produtoParaItem(peca({ codigo: null })).codigo).toBe('123');
    expect(produtoParaItem(peca({ descricao: 'PLATO 12&quot; DUPLO' })).descricao).toBe('PLATO 12" DUPLO');
  });

  it('indexa por SKU e por id Omie, pulando máquinas', () => {
    const { porSku, porId } = indexarProdutos([peca(), peca({ codigo: 'TRATOR', codigo_produto: 9, familia_nome: 'Trator Novo' })]);
    expect(porSku.get('CASTRO|000135')?.descricao).toBe('Arruela Pressao 1/2');
    expect(porId.get('CASTRO|123')?.codigo).toBe('000135');
    expect(porSku.has('CASTRO|TRATOR')).toBe(false);
  });

  it('busca: acrescenta só o que o espelho de características não tem, ordenado por descrição', () => {
    const itens = [{ conta_omie: 'CASTRO', codigo: '000135', descricao: 'Arruela (caract)', caracteristicas: { '#PRATELEIRA': '3' } }];
    const r = mesclarFallbackBusca(itens, [
      peca(), // já existe → não duplica
      peca({ codigo: '000275', codigo_produto: 2, descricao: 'Retentor 01783' }),
      peca({ codigo: '000028', codigo_produto: 3, descricao: 'Arruela MB 7' }),
      peca({ codigo: 'T1', codigo_produto: 4, descricao: 'Trator', familia_nome: 'Trator Novo' }),
    ]);
    expect(r.map((i) => i.codigo)).toEqual(['000135', '000028', '000275']);
    expect(r[0].origem).toBeUndefined();
    expect(r[1].origem).toBe('produtos');
    expect(r[1].caracteristicas).toBeNull();
  });

  it('busca: respeita o limite', () => {
    const muitos = Array.from({ length: 5 }, (_, i) => peca({ codigo: `C${i}`, codigo_produto: i }));
    expect(mesclarFallbackBusca([], muitos, 3)).toHaveLength(3);
  });
});
