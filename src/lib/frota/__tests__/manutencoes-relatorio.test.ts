import { describe, it, expect } from 'vitest';
import { enriquecer, noPeriodo, ordenarPorData, totaisPorOrigem } from '../manutencoes-relatorio';
import type { ManutencaoView } from '../tipos';

const base = (p: Partial<ManutencaoView>): ManutencaoView => ({
  id: '1', veiculo_id: null, placa: 'ABC1234', origem: 'manual', tipo: null, status: null,
  descricao: null, fornecedor: null, valor_total: null, data: null, hodometro: null, ...p,
});

describe('enriquecer', () => {
  it('requisição ganha obs, solicitante e OS', () => {
    const [s] = enriquecer(
      [base({ id: '6420', origem: 'requisicao', descricao: 'Troca de pneus' })],
      [{ id: 6420, obs: '  4 pneus\n aro 15 ', solicitante: 'Danilo', ordem_servico: '812', status: 'financeiro' }],
      [],
    );
    expect(s.referencia).toBe('Req #6420');
    expect(s.detalhe).toBe('4 pneus aro 15');
    expect(s.extras).toEqual(['Solicitante: Danilo', 'OS 812']);
  });

  it('Rota Exata não repete a observação quando ela já é a descrição', () => {
    const [a, b] = enriquecer(
      [
        base({ id: 'u1', origem: 'rotaexata', descricao: 'Troca de óleo', tipo: 'Preventiva', status: 'Realizada' }),
        base({ id: 'u2', origem: 'rotaexata', descricao: 'Troca de óleo' }),
      ],
      [],
      [
        { id: 'u1', descricao: null, observacao: 'Troca de óleo', tipo: 'Preventiva', status: 'Realizada' },
        { id: 'u2', descricao: 'Troca de óleo', observacao: 'Filtro de ar também', tipo: null, status: null },
      ],
    );
    expect(a.detalhe).toBeNull();
    expect(a.extras).toEqual(['Preventiva', 'Realizada']);
    expect(a.referencia).toBe('Rota Exata');
    expect(b.detalhe).toBe('Filtro de ar também');
  });

  it('sem detalhe na fonte não quebra', () => {
    const [s] = enriquecer([base({ id: '9', origem: 'requisicao' })], [], []);
    expect(s.detalhe).toBeNull();
    expect(s.extras).toEqual([]);
  });
});

describe('período e ordem', () => {
  it('noPeriodo', () => {
    expect(noPeriodo('2026-10-05', '', '')).toBe(true);
    expect(noPeriodo(null, '', '')).toBe(true);
    expect(noPeriodo(null, '2026-10-01', '')).toBe(false);
    expect(noPeriodo('2026-10-05', '2026-10-01', '2026-10-31')).toBe(true);
    expect(noPeriodo('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false);
  });

  it('ordena do mais recente, sem data no fim', () => {
    const r = ordenarPorData([{ data: null }, { data: '2026-01-02' }, { data: '2026-05-01' }]);
    expect(r.map((x) => x.data)).toEqual(['2026-05-01', '2026-01-02', null]);
  });

  it('totais por origem', () => {
    const t = totaisPorOrigem([
      { origem: 'requisicao', valor_total: 10 },
      { origem: 'requisicao', valor_total: null },
      { origem: 'rotaexata', valor_total: 5.5 },
    ]);
    expect(t.requisicao).toEqual({ n: 2, total: 10 });
    expect(t.rotaexata).toEqual({ n: 1, total: 5.5 });
  });
});
