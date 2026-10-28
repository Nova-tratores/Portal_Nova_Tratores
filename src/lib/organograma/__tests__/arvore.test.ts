import { describe, it, expect } from 'vitest';
import { juntarPessoas, montarArvore, criaCiclo, contarEquipe, type UsuarioPortal, type FuncionarioRHOrg, type VinculoOrg, type PessoaOrg } from '../arvore';

const u = (id: string, nome: string, extra: Partial<UsuarioPortal> = {}): UsuarioPortal =>
  ({ id, nome, email: null, funcao: null, avatar_url: null, ativo: true, ...extra });
const f = (id: string, nome: string, extra: Partial<FuncionarioRHOrg> = {}): FuncionarioRHOrg =>
  ({ id, nome, email: null, empresa: 'NOVA', cargo: null, departamento: null, foto_url: null, status: 'ativo', data_demissao: null, ...extra });
const v = (pessoa: string, gestor: string | null, extra: Partial<VinculoOrg> = {}): VinculoOrg =>
  ({ pessoa_chave: pessoa, gestor_chave: gestor, topo: false, fora: false, cargo: null, ordem: 0, ...extra });

describe('juntarPessoas', () => {
  const ps = juntarPessoas(
    [
      u('1', 'José Ortiz', { email: 'Antonio@x.com', funcao: 'T.I.' }),
      u('2', 'Larissa Garcia', { funcao: 'PÃ³s Vendas' }),
      u('3', 'Mecânico Teste', { funcao: 'Técnico (TESTE)' }),
      u('4', 'ROGERIA (estação de impressão)'),
      u('5', 'Saiu', { ativo: false }),
    ],
    [
      f('a', 'Jose Antonio Vaz Ortiz', { email: 'antonio@x.com', cargo: 'Diretor', departamento: 'Diretoria' }),
      f('b', 'larissa garcia', { cargo: 'Assistente' }),
      f('c', 'Pedro Motta', { cargo: 'Mecânico', departamento: 'Pós Vendas' }),
      f('d', 'Demitido', { data_demissao: '2026-01-01' }),
    ],
  );
  it('casa por e-mail e por nome; RH sem login entra; teste, estação e demitido ficam fora', () => {
    expect(ps.map((p) => [p.chave, p.origem])).toEqual([
      ['u:1', 'ambos'], ['u:2', 'ambos'], ['rh:c', 'rh'],
    ]);
  });
  it('cargo e setor vêm do RH; setor do portal com acento quebrado é consertado', () => {
    expect(ps[0]).toMatchObject({ cargo: 'Diretor', setor: 'Diretoria', empresa: 'NOVA' });
    expect(juntarPessoas([u('9', 'Nicolly', { funcao: 'PÃ³s Vendas' })], [])[0].setor).toBe('Pós Vendas');
  });
});

describe('criaCiclo', () => {
  const vs = [v('B', 'A'), v('C', 'B')];
  it('chefe de si mesmo e chefe que está abaixo = ciclo', () => {
    expect(criaCiclo('A', 'A', vs)).toBe(true);
    expect(criaCiclo('A', 'C', vs)).toBe(true);
    expect(criaCiclo('C', 'A', vs)).toBe(false);
    expect(criaCiclo('A', null, vs)).toBe(false);
  });
});

describe('montarArvore', () => {
  const p = (chave: string): PessoaOrg => ({ chave, nome: chave, foto: null, cargo: null, setor: null, empresa: null, origem: 'portal', papeis: [], pratica: [] });
  const pessoas = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(p);
  const r = montarArvore(pessoas, [
    v('A', null, { topo: true }), v('B', 'A', { ordem: 2 }), v('C', 'A', { ordem: 1, cargo: 'Gerente' }), v('D', 'C'),
    v('E', 'X'),            // chefe que não existe → a posicionar
    v('F', null, { fora: true }),
    // G sem linha → a posicionar
  ]);
  it('topo, filhos em ordem, cargo sobrescrito', () => {
    expect(r.raizes.map((n) => n.pessoa.chave)).toEqual(['A']);
    expect(r.raizes[0].filhos.map((n) => n.pessoa.chave)).toEqual(['C', 'B']);
    expect(r.raizes[0].filhos[0].pessoa.cargo).toBe('Gerente');
    expect(contarEquipe(r.raizes[0])).toBe(3);
  });
  it('a posicionar e fora', () => {
    expect(r.aPosicionar.map((n) => n.pessoa.chave)).toEqual(['E', 'G']);
    expect(r.fora.map((x) => x.chave)).toEqual(['F']);
  });
  it('círculo gravado não trava: os dois vão para "a posicionar"', () => {
    const c = montarArvore([p('A'), p('B')], [v('A', 'B'), v('B', 'A')]);
    expect(c.raizes).toEqual([]);
    expect(c.aPosicionar.map((n) => n.pessoa.chave)).toEqual(['A', 'B']);
  });
  it('a posicionar leva a equipe junto', () => {
    const c = montarArvore([p('A'), p('B')], [v('B', 'A')]);
    expect(c.aPosicionar.map((n) => [n.pessoa.chave, n.filhos.length])).toEqual([['A', 1]]);
  });
});
