import { describe, it, expect } from 'vitest';
import { agruparCombinacoes, combinacaoDoItem, maisRecentes, dataOmieParaISO, type OSLevantada } from '@/lib/pos/levantamento-fiscal';

const item = (cst: string, iss: number, retem = 'N') => ({ nIdItem: 1, cNbs: '120015000', cRetemISS: retem, impostos: { cCST: cst, nAliqISS: iss } });
const os = (n: number, cli: number, data: string, itens: ReturnType<typeof item>[], valor = 100): OSLevantada => ({ nCodOS: n, cNumOS: String(n), dataFat: data, codCli: cli, valor, itens });

describe('levantamento fiscal', () => {
  it('agrupa itens iguais na mesma combinação e conta OS, itens e clientes', () => {
    const r = agruparCombinacoes([
      os(1, 10, '2026-09-01', [item('000', 2), item('000', 2)]),
      os(2, 11, '2026-09-05', [item('000', 2)]),
      os(3, 12, '2026-09-10', [item('000', 2, 'S')], 500),
    ], new Map([[12, { nome: 'PREFEITURA X', documento: '12345678000199' }]]));
    expect(r.totalOS).toBe(3);
    expect(r.totalItens).toBe(4);
    expect(r.combinacoes).toHaveLength(2);
    const [comum, pref] = r.combinacoes;
    expect(comum.qtdOS).toBe(2);
    expect(comum.qtdItens).toBe(3);
    expect(comum.valor).toBe(200);
    expect(pref.clientes).toEqual([{ codCli: 12, nome: 'PREFEITURA X', documento: '12345678000199', qtdOS: 1 }]);
    expect(pref.campos.cRetemISS).toBe('S');
    expect(r.periodo).toEqual({ de: '2026-09-01', ate: '2026-09-10' });
    expect(r.porCampo.cRetemISS).toEqual([{ valor: 'N', qtdItens: 3 }, { valor: 'S', qtdItens: 1 }]);
    expect(r.camposSemDado).toContain('cClassTrib');
  });
  it('combinação ignora campos vazios e normaliza NBS', () => {
    const c = combinacaoDoItem({ cNbs: '1.2001.50.00', impostos: { cCST: '', nAliqISS: '2.00' } });
    expect(c.campos).toEqual({ cNbs: '120015000', nAliqISS: 2 });
  });
  it('mais recentes por data de faturamento', () => {
    const l = maisRecentes([os(1, 1, '2026-01-01', []), os(2, 1, '2026-03-01', []), os(3, 1, '2026-02-01', [])], 2);
    expect(l.map((o) => o.nCodOS)).toEqual([2, 3]);
    expect(dataOmieParaISO('09/10/2026')).toBe('2026-10-09');
    expect(dataOmieParaISO('')).toBe('');
  });
});
