import { describe, it, expect } from 'vitest';
import { validarRascunho, rascunhoBasico, tarefasSoltas, tipoPadrao, nomeDaFicha, normalizarEdicao } from '../fichas';
import type { TarefaOrg } from '../tarefas';

const t = (id: number, assunto: string | null, acao: string): TarefaOrg => ({ id, origem: 'pos-vendas', ordem: id, numero: null, assunto, acao, onde: null, quando: null, frequencia: null, quem: ['Auxiliar Adm 2'], justificativa: null, destinatario: null, areas: [] });
const tarefas = [t(1, 'Garantia', 'Abertura'), t(2, 'Garantia', 'Envio'), t(3, 'OS', 'Abrir OS entrega técnica')];

describe('rascunho da IA', () => {
  it('aceita só tarefas da função, cada uma uma vez; kpi fora do catálogo vira texto', () => {
    const { ficha, avisos } = validarRascunho({
      titulo: ' Auxiliar Administrativo de Garantias ', missao: 'Garantir o reembolso.', responde_a: 'Gerente Pós-Vendas',
      responsabilidades: [{ titulo: 'Garantias', descricao: 'do pedido ao fechamento', tarefas: [1, 2, 99] }, { titulo: 'OS', tarefas: [2] }],
      autoridade: ['[VALIDAR] Envia garantia sem aprovação'], requisitos: [''],
      indicadores: [{ texto: 'Garantias abertas', kpi: 'garantias_abertas' }, { texto: 'X', kpi: 'inventado' }, 'Tempo de envio'],
    }, [1, 2, 3], ['garantias_abertas'], ['Gerente Pós-Vendas']);
    expect(ficha.titulo).toBe('Auxiliar Administrativo de Garantias');
    expect(ficha.responsabilidades).toEqual([
      { titulo: 'Garantias', descricao: 'do pedido ao fechamento', tarefas: [1, 2] },
      { titulo: 'OS', descricao: '', tarefas: [] },
    ]);
    expect(ficha.requisitos).toEqual([]);
    expect(ficha.indicadores).toEqual([{ texto: 'Garantias abertas', kpi: 'garantias_abertas' }, { texto: 'X', kpi: null }, { texto: 'Tempo de envio', kpi: null }]);
    expect(ficha.responde_a).toBe('Gerente Pós-Vendas');
    expect(avisos.join(' | ')).toMatch(/tarefa 99.*inventado.*1 tarefa/);
  });
  it('responde_a desconhecido some', () => {
    expect(validarRascunho({ responde_a: 'Rei' }, [], [], ['Gerente']).ficha.responde_a).toBeNull();
  });
});

describe('ficha', () => {
  it('rascunho básico agrupa por assunto e não deixa tarefa solta', () => {
    const r = rascunhoBasico('Auxiliar Adm 2', tarefas);
    expect(r.responsabilidades.map((x) => [x.titulo, x.tarefas])).toEqual([['Garantia', [1, 2]], ['OS', [3]]]);
    expect(tarefasSoltas(r, tarefas)).toEqual([]);
    expect(tarefasSoltas({ responsabilidades: [{ titulo: 'G', descricao: '', tarefas: [1] }] }, tarefas).map((x) => x.id)).toEqual([2, 3]);
  });
  it('grupos e nome exibido', () => {
    expect(tipoPadrao('Todos')).toBe('grupo');
    expect(tipoPadrao('Todo o escritório')).toBe('grupo');
    expect(tipoPadrao('Todos os mecânicos')).toBe('funcao');
    expect(nomeDaFicha({ funcao: 'Todos os mecânicos', titulo: null })).toBe('Mecânico');
    expect(nomeDaFicha({ funcao: 'Valdir', titulo: 'Serviços gerais' })).toBe('Serviços gerais');
  });
  it('edição só mexe no que veio', () => {
    expect(normalizarEdicao({ missao: '  x  ', indicadores: [{ texto: 'a', kpi: 'nao' }] }, ['sim'])).toEqual({ missao: 'x', indicadores: [{ texto: 'a', kpi: null }] });
  });
});
