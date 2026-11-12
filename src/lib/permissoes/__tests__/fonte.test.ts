import { describe, expect, it } from 'vitest';
import { chavesDaEntrada, chavesDaV2, diferenca, mesmoConjunto, planejarPessoa, planoPessoaVazio, telasDasChaves, telasDaPessoa, type EntradaPessoa } from '../fonte';
import { nivelDaChaveAntiga } from '../resolver';
import { catalogoTelas } from '../telas';

const CAT = catalogoTelas();
const conj = (nome: string, chaves: string[]) => ({ id: nome, nome, telas: chaves.map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela) })) });
const vazio: EntradaPessoa = { conjuntos: [], extras: [], bloqueios: [] };

function sorteio(seed: number, n: number): string[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return [...new Set(Array.from({ length: n }, () => CAT[Math.floor(rnd() * CAT.length)].id))];
}

/** aplica um plano numa entrada (como o servidor faz no banco) */
function aplicar(e: EntradaPessoa, chaves: string[]): EntradaPessoa {
  const p = planejarPessoa(CAT, e, chaves);
  if (!p) throw new Error('sem plano');
  const tira = (l: { tela: string; nivel: string }[], fora: string[]) => l.filter((o) => !fora.includes(o.tela));
  return {
    conjuntos: e.conjuntos,
    extras: [...tira(e.extras, p.removerExtras), ...p.incluirExtras],
    bloqueios: [...tira(e.bloqueios, p.removerBloqueios), ...p.incluirBloqueios],
  };
}

describe('chavesDaV2: v2 → lista de chaves', () => {
  it('módulo inteiro vira a chave do módulo; com ação explícita junto', () => {
    const alvo = telasDasChaves(CAT, ['pos', 'pos:faturar']);
    expect(chavesDaV2(CAT, alvo)?.sort()).toEqual(['pos', 'pos:faturar']);
  });
  it('módulo com tela bloqueada vira as telas uma a uma', () => {
    const e: EntradaPessoa = { conjuntos: [conj('Pós', ['pos'])], extras: [], bloqueios: [{ tela: 'pos:criar', nivel: 'ver' }] };
    const alvo = telasDaPessoa(CAT, e);
    const k = chavesDaV2(CAT, alvo)!;
    expect(k).not.toContain('pos');
    expect(k).not.toContain('pos:criar');
    expect(mesmoConjunto(telasDasChaves(CAT, k), alvo)).toBe(true);
  });
  it('ida e volta em 400 listas sorteadas', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const alvo = telasDasChaves(CAT, sorteio(seed, 1 + (seed % 25)));
      const k = chavesDaV2(CAT, alvo);
      expect(k, `seed ${seed}`).not.toBeNull();
      expect(mesmoConjunto(telasDasChaves(CAT, k!), alvo), `seed ${seed}`).toBe(true);
    }
  });
});

describe('planejarPessoa: caixinhas → extras/bloqueios sobre os conjuntos', () => {
  it('sem conjunto: cada chave vira um extra', () => {
    const p = planejarPessoa(CAT, vazio, ['pos', 'ppv:faturar'])!;
    expect(p.incluirExtras.map((o) => o.tela).sort()).toEqual(['pos', 'ppv:faturar']);
    expect(p.incluirBloqueios).toEqual([]);
  });
  it('o que o departamento já dá não vira extra', () => {
    const e = { ...vazio, conjuntos: [conj('Pós', ['pos', 'ppv'])] };
    const p = planejarPessoa(CAT, e, ['pos', 'ppv', 'requisicoes'])!;
    expect(p.incluirExtras.map((o) => o.tela)).toEqual(['requisicoes']);
  });
  it('desmarcar algo do departamento vira bloqueio (no ponto mais alto)', () => {
    const e = { ...vazio, conjuntos: [conj('Pós', ['pos', 'ppv'])] };
    const p = planejarPessoa(CAT, e, ['pos'])!;
    expect(p.incluirBloqueios).toEqual([{ tela: 'ppv', nivel: 'ver' }]);
    expect(mesmoConjunto(telasDaPessoa(CAT, aplicar(e, ['pos'])), telasDasChaves(CAT, ['pos']))).toBe(true);
  });
  it('remarcar tira o bloqueio; mesma lista = plano vazio', () => {
    const e = aplicar({ ...vazio, conjuntos: [conj('Pós', ['pos', 'ppv'])] }, ['pos'])
    const p = planejarPessoa(CAT, e, ['pos', 'ppv'])!;
    expect(p.removerBloqueios).toEqual(['ppv']);
    expect(planoPessoaVazio(planejarPessoa(CAT, e, ['pos'])!)).toBe(true);
  });
  it('resultado = exatamente as caixinhas, em 300 casos sorteados com conjuntos', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const e = { ...vazio, conjuntos: [conj('A', sorteio(seed * 7, 1 + (seed % 9))), conj('B', sorteio(seed * 13, seed % 4))] };
      const chaves = sorteio(seed, 1 + (seed % 20));
      const depois = aplicar(e, chaves);
      expect(mesmoConjunto(telasDaPessoa(CAT, depois), telasDasChaves(CAT, chaves)), `seed ${seed}`).toBe(true);
    }
  });
});

describe('chavesDaEntrada: lista a partir do que foi concedido', () => {
  it('telas dadas uma a uma continuam uma a uma (não viram o módulo)', () => {
    const filhos = telasDasChaves(CAT, ['pos']);
    const umaAUma = [...filhos].filter((t) => t !== 'pos' && t.startsWith('pos:'));
    const e = { ...vazio, extras: umaAUma.map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela) })) };
    expect(chavesDaEntrada(CAT, e)).not.toContain('pos');
  });
  it('departamento com bloqueio vira as telas uma a uma, sem a bloqueada', () => {
    const e: EntradaPessoa = { conjuntos: [conj('Pós', ['pos', 'ppv'])], extras: [], bloqueios: [{ tela: 'pos:criar', nivel: 'ver' }] };
    const k = chavesDaEntrada(CAT, e)!;
    expect(k).toContain('ppv');
    expect(k).not.toContain('pos');
    expect(k).not.toContain('pos:criar');
    expect(mesmoConjunto(telasDasChaves(CAT, k), telasDaPessoa(CAT, e))).toBe(true);
  });
  it('fecha com o resultado em 300 entradas sorteadas', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const bl = sorteio(seed * 3, seed % 3).map((tela) => ({ tela, nivel: 'ver' as const }));
      const e: EntradaPessoa = { conjuntos: [conj('A', sorteio(seed * 5, 1 + (seed % 8)))], extras: sorteio(seed, seed % 6).map((tela) => ({ tela, nivel: nivelDaChaveAntiga(tela) })), bloqueios: bl };
      // bloquear a ÚNICA tela de um módulo deixa o módulo "aberto e vazio" (regra do banco):
      // a lista antiga não escreve isso — o editor bloqueia o módulo inteiro e nunca gera o caso
      if (!chavesDaV2(CAT, telasDaPessoa(CAT, e))) continue;
      const k = chavesDaEntrada(CAT, e);
      expect(k, `seed ${seed}`).not.toBeNull();
      expect(mesmoConjunto(telasDasChaves(CAT, k!), telasDaPessoa(CAT, e)), `seed ${seed}`).toBe(true);
    }
  });
});

it('diferenca lista quem ganha e quem perde', () => {
  expect(diferenca(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ ganha: ['c'], perde: ['a'] });
});
