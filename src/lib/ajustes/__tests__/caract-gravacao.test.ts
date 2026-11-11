import { describe, it, expect } from 'vitest';
import { diagnosticarCaract, ehLocacao, exibicaoParaIncluir, erroJaExiste, erroNaoAssociada, precisaRegravar, EXIBICAO_LOCACAO } from '../caract-gravacao';

describe('caract-gravacao', () => {
  it('reconhece as locações', () => {
    expect(ehLocacao('#PRATELEIRA')).toBe(true);
    expect(ehLocacao(' #andar ')).toBe(true);
    expect(ehLocacao('#CAIXA')).toBe(true);
    expect(ehLocacao('Tipo:')).toBe(false);
  });

  it('inclusão nova: locação ganha o padrão; outras vão sem ajuste', () => {
    expect(exibicaoParaIncluir('#CAIXA', null)).toEqual(EXIBICAO_LOCACAO);
    expect(exibicaoParaIncluir('Tipo:', null)).toBeNull();
  });

  it('troca mantém os ajustes da associação', () => {
    expect(exibicaoParaIncluir('#CAIXA', { cExibirItemNF: 'N', cExibirItemPedido: 'S', cExibirOrdemProd: 'N' }))
      .toEqual({ cExibirItemNF: 'N', cExibirItemPedido: 'S', cExibirOrdemProd: 'N' });
    expect(exibicaoParaIncluir('Tipo:', { cExibirItemNF: 'N', cExibirItemPedido: 'N', cExibirOrdemProd: 'N' }))
      .toEqual({ cExibirItemNF: 'N', cExibirItemPedido: 'N', cExibirOrdemProd: 'N' });
  });

  it('locação toda "N" (inclusão antiga do portal) ganha o padrão', () => {
    expect(exibicaoParaIncluir('#PRATELEIRA', { cExibirItemNF: 'N', cExibirItemPedido: 'N', cExibirOrdemProd: 'N' })).toEqual(EXIBICAO_LOCACAO);
  });

  it('lê as mensagens da Omie', () => {
    expect(erroNaoAssociada('ERROR: Característica do Produto não cadastrada.')).toBe(true);
    expect(erroJaExiste('ERROR: Característica já cadastrada para o produto')).toBe(true);
    expect(erroJaExiste('ERROR: Conteúdo informado não confere')).toBe(false);
  });

  it('só regrava quando muda conteúdo ou ajuste, ou quando forçado', () => {
    const atual = { cConteudo: '03', ...EXIBICAO_LOCACAO };
    expect(precisaRegravar(atual, '03', EXIBICAO_LOCACAO)).toBe(false);
    expect(precisaRegravar(atual, '04', EXIBICAO_LOCACAO)).toBe(true);
    expect(precisaRegravar({ ...atual, cExibirItemPedido: 'N' }, '03', EXIBICAO_LOCACAO)).toBe(true);
    expect(precisaRegravar(atual, '03', EXIBICAO_LOCACAO, true)).toBe(true);
  });
});

describe('diagnosticarCaract', () => {
  const base = { cNomeCaract: '#CAIXA', cExibirItemNF: 'N', cExibirItemPedido: 'S', cExibirOrdemProd: 'S' };
  it('alterada pela API depois da inclusão = tela velha', () => {
    expect(diagnosticarCaract({ ...base, info: { dInc: '04/07/2023', hInc: '13:18:38', dAlt: '11/11/2026', hAlt: '16:05:22', uAlt: 'WEBSERVICE' } }).telaVelha).toBe(true);
  });
  it('incluída pela API (inclusão = alteração) não é tela velha', () => {
    expect(diagnosticarCaract({ ...base, info: { dInc: '11/11/2026', hInc: '16:25:18', dAlt: '11/11/2026', hAlt: '16:25:18', uAlt: 'WEBSERVICE' } }).telaVelha).toBe(false);
  });
  it('alterada por usuário na tela da Omie não é tela velha', () => {
    expect(diagnosticarCaract({ ...base, info: { dInc: '05/07/2023', hInc: '08:52:01', dAlt: '17/03/2025', hAlt: '10:15:06', uAlt: 'P001026770' } }).telaVelha).toBe(false);
  });
  it('locação toda N = sem exibição; Tipo toda N não conta', () => {
    expect(diagnosticarCaract({ cNomeCaract: '#ANDAR', cExibirItemNF: 'N', cExibirItemPedido: 'N', cExibirOrdemProd: 'N', info: {} }).semExibicao).toBe(true);
    expect(diagnosticarCaract({ cNomeCaract: 'Tipo:', cExibirItemNF: 'N', cExibirItemPedido: 'N', cExibirOrdemProd: 'N', info: {} }).semExibicao).toBe(false);
  });
});
