import { describe, it, expect } from 'vitest';
import { ligacaoAutomatica, ligarFuncoes, tarefasPorPessoa, funcoesDaPessoa, tarefasSemPessoa, renomearNaLista, alternarOrdem, ordenarPor, type TarefaOrg } from '../tarefas';
import type { PessoaOrg } from '../arvore';

const p = (chave: string, nome: string): PessoaOrg => ({ chave, nome, foto: null, cargo: null, setor: null, empresa: null, origem: 'portal', papeis: [], pratica: [] });
const t = (id: number, quem: string[]): TarefaOrg => ({ id, origem: 'pos-vendas', ordem: id, numero: null, assunto: null, acao: `T${id}`, onde: null, quando: null, frequencia: null, quem, justificativa: null, destinatario: null, areas: [] });

const pessoas = [p('u:1', 'Henri Irneh'), p('u:2', 'Mariano Ramos Do Val'), p('u:3', 'Danilo Correa'), p('u:4', 'Danilo de Souza'), p('u:5', 'Larissa Garcia')];
const tarefas = [t(1, ['Auxiliar Adm 1']), t(2, ['Henri']), t(3, ['Auxiliar Adm 1', 'Estagiário']), t(4, []), t(5, ['Danilo'])];

describe('ligação automática', () => {
  it('nome único liga; nome repetido ou função não liga', () => {
    expect(ligacaoAutomatica('Henri', pessoas)).toEqual(['u:1']);
    expect(ligacaoAutomatica('mariano', pessoas)).toEqual(['u:2']);
    expect(ligacaoAutomatica('Danilo', pessoas)).toEqual([]);
    expect(ligacaoAutomatica('Auxiliar Adm 1', pessoas)).toEqual([]);
  });
});

describe('ligarFuncoes e tarefas por pessoa', () => {
  const lig = ligarFuncoes(tarefas, [{ funcao: 'Auxiliar Adm 1', pessoas: ['u:5', 'u:999'] }], pessoas);
  it('salvo pelo admin vence; pessoa que não existe mais some; ordena por nº de tarefas', () => {
    expect(lig[0]).toEqual({ funcao: 'Auxiliar Adm 1', pessoas: ['u:5'], automatico: false, tarefas: 2 });
    expect(lig.find((l) => l.funcao === 'Henri')).toMatchObject({ pessoas: ['u:1'], automatico: true });
  });
  it('tarefas da pessoa sem repetir e funções que ela ocupa', () => {
    const m = tarefasPorPessoa(tarefas, lig);
    expect(m.get('u:5')!.map((x) => x.id)).toEqual([1, 3]);
    expect(m.get('u:1')!.map((x) => x.id)).toEqual([2]);
    expect(funcoesDaPessoa('u:5', lig)).toEqual(['Auxiliar Adm 1']);
  });
  it('sem pessoa: sem "quem" ou função ainda vaga', () => {
    expect(tarefasSemPessoa(tarefas, lig).map((x) => x.id)).toEqual([4, 5]);
  });
});

describe('renomear e ordenar', () => {
  it('renomeia sem repetir ao juntar', () => {
    expect(renomearNaLista(['A', 'B'], 'A', 'C')).toEqual(['C', 'B']);
    expect(renomearNaLista(['A', 'B'], 'A', 'B')).toEqual(['B']);
  });
  it('cabeçalho: A→Z, Z→A, volta', () => {
    const a = alternarOrdem<'x' | 'y'>(null, 'x');
    expect(a).toEqual({ coluna: 'x', dir: 'asc' });
    const b = alternarOrdem(a, 'x');
    expect(b).toEqual({ coluna: 'x', dir: 'desc' });
    expect(alternarOrdem(b, 'x')).toBeNull();
    expect(alternarOrdem(b, 'y')).toEqual({ coluna: 'y', dir: 'asc' });
  });
  it('ordena com acento e número; vazio no fim nos dois sentidos', () => {
    const l = ['Auxiliar 10', '', 'Ágil', 'Auxiliar 9', 'Zé'];
    expect(ordenarPor(l, (x) => x, 'asc')).toEqual(['Ágil', 'Auxiliar 9', 'Auxiliar 10', 'Zé', '']);
    expect(ordenarPor(l, (x) => x, 'desc')).toEqual(['Zé', 'Auxiliar 10', 'Auxiliar 9', 'Ágil', '']);
    expect(ordenarPor([3, 10, 1], (x) => x, 'desc')).toEqual([10, 3, 1]);
  });
});
