import { describe, it, expect } from 'vitest';
import { normalizarCampos, camposDoOmie, diffCampos, paramsOmieCampos, updateEspelhoCampos, rawComCampos, temCampos, isoParaBR, brParaISO } from './contas-campos';

describe('normalizarCampos', () => {
  it('só entra o que foi mandado; vazio = não mexer (observação vazia = limpar)', () => {
    expect(normalizarCampos({})).toEqual({ campos: {} });
    expect(normalizarCampos({ dataVencimento: '', codigoProjeto: '', numeroDocumento: '  ', observacao: '' })).toEqual({ campos: { observacao: '' } });
    expect(normalizarCampos({ dataVencimento: '2026-10-30', dataPrevisao: '2026-11-05', codigoProjeto: '2403643048', idContaCorrente: 2506155996, numeroDocumento: ' NF 123 ', observacao: ' pago em 2x ' }))
      .toEqual({ campos: { dataVencimento: '2026-10-30', dataPrevisao: '2026-11-05', codigoProjeto: 2403643048, idContaCorrente: 2506155996, numeroDocumento: 'NF 123', observacao: 'pago em 2x' } });
  });
  it('recusa data e código inválidos', () => {
    expect(normalizarCampos({ dataVencimento: '30/10/2026' }).erro).toMatch(/Vencimento/);
    expect(normalizarCampos({ dataPrevisao: '2026-02-30' }).erro).toMatch(/Previsão/);
    expect(normalizarCampos({ codigoProjeto: 'abc' }).erro).toMatch(/Projeto/);
    expect(normalizarCampos({ idContaCorrente: -1 }).erro).toMatch(/Conta corrente/);
    expect(normalizarCampos({ numeroDocumento: 'x'.repeat(61) }).erro).toMatch(/60/);
  });
  it('temCampos', () => {
    expect(temCampos({})).toBe(false);
    expect(temCampos({ observacao: '' })).toBe(true);
    expect(temCampos(null)).toBe(false);
  });
});

describe('datas', () => {
  it('ISO ↔ BR', () => {
    expect(isoParaBR('2026-10-30')).toBe('30/10/2026');
    expect(brParaISO('30/10/2026')).toBe('2026-10-30');
    expect(brParaISO('2026-10-30')).toBe('2026-10-30');
    expect(brParaISO('')).toBeNull();
  });
});

describe('diff contra a Omie', () => {
  const atualOmie = { data_vencimento: '07/10/2026', data_previsao: '20/10/2026', codigo_projeto: 0, id_conta_corrente: 2506155996, numero_documento: '063818965/1', observacao: '' };
  it('camposDoOmie traduz o registro do ConsultarConta', () => {
    expect(camposDoOmie(atualOmie)).toEqual({ dataVencimento: '2026-10-07', dataPrevisao: '2026-10-20', codigoProjeto: null, idContaCorrente: 2506155996, numeroDocumento: '063818965/1', observacao: '' });
  });
  it('só o que muda, com o valor anterior', () => {
    const atual = camposDoOmie(atualOmie);
    const { mudou, anterior } = diffCampos(atual, { dataVencimento: '2026-10-30', dataPrevisao: '2026-10-20', codigoProjeto: 2403643048, idContaCorrente: 2506155996, observacao: '' });
    expect(mudou).toEqual({ dataVencimento: '2026-10-30', codigoProjeto: 2403643048 });
    expect(anterior).toEqual({ dataVencimento: '2026-10-07', codigoProjeto: null });
  });
  it('parâmetros da Omie, espelho e raw', () => {
    const mudou = { dataVencimento: '2026-10-30', codigoProjeto: 2403643048, observacao: 'frete Rodonaves' };
    expect(paramsOmieCampos(mudou)).toEqual({ data_vencimento: '30/10/2026', codigo_projeto: 2403643048, observacao: 'frete Rodonaves' });
    expect(updateEspelhoCampos(mudou)).toEqual({ data_vencimento: '2026-10-30', observacao: 'frete Rodonaves' });
    expect(rawComCampos({ codigo_lancamento_omie: 1, data_vencimento: '07/10/2026' }, mudou)).toEqual({ codigo_lancamento_omie: 1, data_vencimento: '30/10/2026', codigo_projeto: 2403643048, observacao: 'frete Rodonaves' });
    expect(paramsOmieCampos({})).toEqual({});
  });
});
