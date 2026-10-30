import { describe, it, expect } from 'vitest';
import { compararAcessos, nivelReal, situacao, type TelaOpcao } from '../acessos';
import type { TarefaOrg } from '../tarefas';

const POS: TelaOpcao = { id: 'pos', nome: 'POS', separaEditar: true };
const NOTAS: TelaOpcao = { id: 'estoque:notas', nome: 'Notas', separaEditar: false };
const a = (perms: string[], isAdmin = false) => ({ perms, isAdmin, isDev: false });
const t = (acao: string, telas: TarefaOrg['telas']) => ({ acao, telas }) as TarefaOrg;

describe('nível real', () => {
  it('módulo inteiro edita; só outra ação não', () => {
    expect(nivelReal(a(['pos']), POS)).toBe('editar');
    expect(nivelReal(a(['pos:mover_fase']), POS)).toBe('ver');
    expect(nivelReal(a(['pos:editar']), POS)).toBe('editar');
    expect(nivelReal(a([]), POS)).toBe('nenhum');
    expect(nivelReal(a([], true), POS)).toBe('editar');
  });
  it('tela sem a ação editar só diz se abre', () => {
    expect(nivelReal(a(['estoque:notas']), NOTAS)).toBe('acessa');
    expect(nivelReal(a(['estoque']), NOTAS)).toBe('acessa');
    expect(nivelReal(a(['estoque:outra']), NOTAS)).toBe('nenhum');
  });
});

describe('situação', () => {
  it('cobre pedido × acesso', () => {
    expect(situacao('ver', 'ver')).toBe('ok');
    expect(situacao('ver', 'editar')).toBe('a_mais');
    expect(situacao('editar', 'ver')).toBe('falta_editar');
    expect(situacao('editar', 'nenhum')).toBe('falta');
    expect(situacao('ver', 'acessa')).toBe('nao_separa');
    expect(situacao('editar', 'acessa')).toBe('ok');
  });
});

describe('comparar', () => {
  it('duas tarefas: vale o maior nível; pessoa sem login é avisada', () => {
    const por = new Map([['u:1', [t('A', [{ tela: 'pos', nivel: 'ver' }]), t('B', [{ tela: 'pos', nivel: 'editar' }])]], ['rh:2', [t('C', [{ tela: 'pos', nivel: 'ver' }])]]]);
    const r = compararAcessos(por, [POS], { 'u:1': a(['pos:mover_fase']) });
    expect(r[0]).toMatchObject({ pessoa: 'u:1', pede: 'editar', tem: 'ver', situacao: 'falta_editar', tarefas: ['A', 'B'] });
    expect(r[1]).toMatchObject({ pessoa: 'rh:2', tem: null, situacao: 'sem_login' });
  });
  it('tarefa sem telas não quebra', () => {
    expect(compararAcessos(new Map([['u:1', [{ acao: 'X' } as TarefaOrg]]]), [POS], {})).toEqual([]);
  });
});
