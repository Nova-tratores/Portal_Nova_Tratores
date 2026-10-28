import { describe, it, expect } from 'vitest';
import { filtrarItens, resumoChecklist, categorias, itemAnterior, ehPendencia, lerAlertas, type ItemVisao } from '../checklist-visao';

const it_ = (key: string, resposta: string | null, extra: Partial<ItemVisao> = {}): ItemVisao => ({
  id: key, item_key: key, categoria: null, titulo: null, resposta, observacao: null, foto_url: `https://x/${key}.jpg`, respondido_em: null, ...extra,
});

const itens = [
  it_('extintor', 'ok'),
  it_('crlv', 'ok'),
  it_('pneu_de', 'ok', { ia_analise: { tipo: 'banda', comprova: false, motivo: 'sem sulcos', desgaste: null, marca: null, modelo: null, medida: null, dot: null } }),
  it_('oleo_motor', 'problema', { observacao: 'nível baixo' }),
  it_('painel', 'ok', { foto_url: null }),
];

describe('visualizador do checklist', () => {
  it('pendência = problema ou pneu que a IA não comprova', () => {
    expect(itens.filter(ehPendencia).map((i) => i.item_key)).toEqual(['pneu_de', 'oleo_motor']);
  });
  it('filtra na ordem do checklist', () => {
    expect(filtrarItens(itens, 'tudo').map((i) => i.item_key)).toEqual(['crlv', 'pneu_de', 'oleo_motor', 'painel', 'extintor']);
    expect(filtrarItens(itens, 'pendencias').map((i) => i.item_key)).toEqual(['pneu_de', 'oleo_motor']);
    expect(filtrarItens(itens, 'sem_foto').map((i) => i.item_key)).toEqual(['painel']);
    expect(filtrarItens(itens, 'cat:Motor').map((i) => i.item_key)).toEqual(['oleo_motor']);
  });
  it('resumo e categorias', () => {
    const r = resumoChecklist(itens);
    expect([r.respondidos, r.ok, r.pendencias, r.semFoto]).toEqual([5, 3, 2, 1]);
    expect(r.faltando).toContain('Bateria');
    expect(categorias(itens).find((c) => c.nome === 'Pneus')).toEqual({ nome: 'Pneus', qtd: 1, pendencias: 1 });
  });
  it('acha o mesmo item no mês anterior', () => {
    const ant = [it_('oleo_motor', 'ok', { id: 'velho' })];
    expect(itemAnterior(itens[3], ant)?.id).toBe('velho');
    expect(itemAnterior(itens[0], ant)).toBeNull();
  });
  it('alertas do score', () => {
    expect(lerAlertas('["Checklist completo em menos de 8 minutos"]')).toEqual(['Checklist completo em menos de 8 minutos']);
    expect(lerAlertas('lixo')).toEqual([]);
  });
});
