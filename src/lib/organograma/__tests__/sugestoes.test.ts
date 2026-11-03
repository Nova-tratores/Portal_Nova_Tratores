import { describe, it, expect } from 'vitest';
import { criarIndice, ehRobo, somar, sugerirFuncoes, textoRastro, type Contagem } from '../sugestoes';
import type { TarefaOrg } from '../tarefas';

const t = (ordem: number, quem: string[]) => ({ id: ordem, origem: 'pos-vendas', ordem, acao: `T${ordem}`, quem, areas: [] }) as unknown as TarefaOrg;

describe('quem é quem no histórico', () => {
  const ind = criarIndice([
    { id: '1', nome: 'José Ortiz', email: 'antonio.novatratores@gmail.com' },
    { id: '2', nome: 'Vinicius Correa', email: 'vinicorrea223@gmail.com' },
    { id: '3', nome: 'Danilo', email: null }, { id: '4', nome: 'Danilo', email: null },
  ]);
  it('acento, caixa, espaço e e-mail casam com a mesma pessoa', () => {
    expect(ind('Jose Ortiz')).toBe('u:1');
    expect(ind('José ORtiz')).toBe('u:1');
    expect(ind('antonio.novatratores@gmail.com')).toBe('u:1');
    expect(ind('Vinícius Corrêa ')).toBe('u:2');
  });
  it('nome repetido, robô e desconhecido não resolvem', () => {
    expect(ind('Danilo')).toBeNull();
    expect(ind('Sistema')).toBeNull();
    expect(ind('Fulano')).toBeNull();
    expect(ehRobo('ferreira.vinicius@mahindrabrazil.com')).toBe(true);
    expect(ehRobo('Auto-move: prazo')).toBe(true);
  });
});

describe('sugestões por função', () => {
  const tarefas = [t(1, ['Auxiliar Adm 1']), t(3, ['Auxiliar Adm 1']), t(52, ['Auxiliar Adm 2']), t(16, ['Todos os mecânicos']), t(73, ['Todo o escritório']), t(81, ['Estagiário'])];
  const c: Contagem = {};
  somar(c, 'u:jose', 'os_aberta', 60); somar(c, 'u:jose', 'os_concluida', 90);
  somar(c, 'u:vini', 'os_aberta', 40); somar(c, 'u:vini', 'os_concluida', 10); somar(c, 'u:vini', 'garantia', 95);
  somar(c, 'u:nico', 'garantia', 5); somar(c, null, 'garantia', 99);
  somar(c, 'u:jose', 'requisicao_criar', 300); somar(c, 'u:vini', 'feedback', 4);
  const s = sugerirFuncoes(tarefas, c);
  it('quem mais fez vem primeiro, com o motivo', () => {
    expect(s.get('Auxiliar Adm 1')!.sugestoes.map((x) => x.pessoa)).toEqual(['u:jose', 'u:vini']);
    expect(s.get('Auxiliar Adm 1')!.sugestoes[0].motivos).toEqual(['concluiu 90 OS', 'abriu 60 OS']);
    expect(s.get('Auxiliar Adm 2')!.sugestoes.map((x) => x.pessoa)).toEqual(['u:vini']);
  });
  it('função sem rastro no portal não sugere ninguém', () => {
    expect(s.get('Todos os mecânicos')).toEqual({ situacao: 'sem_rastro', sugestoes: [] });
  });
  it('requisição sozinha ou rastro com poucos registros não sugere', () => {
    expect(s.get('Todo o escritório')).toEqual({ situacao: 'pouco_rastro', sugestoes: [] });
    expect(s.get('Estagiário')).toEqual({ situacao: 'pouco_rastro', sugestoes: [] });
  });
  it('plural certo', () => {
    expect(textoRastro('requisicao_criar', 2)).toBe('criou 2 requisições');
    expect(textoRastro('feedback', 1)).toBe('1 ligação de feedback');
  });
});
