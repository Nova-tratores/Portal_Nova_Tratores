import { describe, it, expect } from 'vitest';
import {
  juntarPorPlaca, ordenarEResumir, classificarChecklist, vendedorDoResponsavel, linkChecklistApp,
  type ItemChecklistMes,
} from '../checklists-mes';

const it0 = (over: Partial<ItemChecklistMes>): ItemChecklistMes => ({
  origem: 'tecnico', tecnico_nome: 'Fulano', placa: 'TKY-6E68', placa_key: 'TKY6E68', descricao: '',
  status: 'pendente', score: null, km: null, fim_em: null, checklist_id: null, ...over,
});

describe('checklists do mês', () => {
  it('mesma placa com dois técnicos vira uma linha, com o melhor checklist e os dois nomes', () => {
    const r = juntarPorPlaca([
      it0({ tecnico_nome: 'Nicolas' }),
      it0({ tecnico_nome: 'Paulo Motta', status: 'ok', checklist_id: 'c1' }),
      it0({ placa: 'TKC-5D99', placa_key: 'TKC5D99', tecnico_nome: 'Gabriel', status: 'ok' }),
    ]);
    expect(r).toHaveLength(2);
    const tky = r.find((x) => x.placa_key === 'TKY6E68')!;
    expect(tky.status).toBe('ok');
    expect(tky.tecnico_nome).toBe('Nicolas / Paulo Motta');
  });

  it('resumo conta por situação e ordena pendentes primeiro', () => {
    const { itens, resumo } = ordenarEResumir([it0({ status: 'ok' }), it0({ status: 'pendente', placa_key: 'X' })]);
    expect(itens[0].status).toBe('pendente');
    expect(resumo).toEqual({ total: 2, pendente: 1, suspeito: 0, em_andamento: 0, ok: 1 });
  });

  it('score abaixo de 50 é suspeito', () => {
    expect(classificarChecklist('completo', 40)).toBe('suspeito');
    expect(classificarChecklist('completo', 90)).toBe('ok');
  });
});

describe('checklist do carro de vendedor (app de vendas)', () => {
  const vendedores = [{ id: 4, nome: 'PEDRO FAVARO' }, { id: 27, nome: 'MARCIO' }];

  it('responsável da Frota casa com o vendedor pelo nome (acento/caixa), placeholder não casa', () => {
    expect(vendedorDoResponsavel('Pedro Fávaro', vendedores)?.id).toBe(4);
    expect(vendedorDoResponsavel('Pedro Silva', vendedores)).toBeNull();
    expect(vendedorDoResponsavel('Vazio', vendedores)).toBeNull();
  });

  it('link abre o checklist completo do carro no app', () => {
    expect(linkChecklistApp('SEB9J47')).toBe('/checklist-veiculo?placa=SEB9J47');
  });
});
