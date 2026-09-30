import { describe, it, expect } from 'vitest';
import {
  diffPendentes, janelasPorEmissao, ehBloqueioOmie, ehListaVazia, patchDeTitulo, decidirPendentes, STATUS_ABERTO,
} from '../abertos-reconciliacao.js';

describe('diffPendentes', () => {
  it('devolve só o que o espelho tem como aberto e a Omie não devolveu, com a emissão', () => {
    const espelho = [
      { codigo_lancamento: 1, synced_at: '2026-09-30T09:00:00', data_emissao: '2026-09-01' },
      { codigo_lancamento: 2, synced_at: '2026-07-31T22:19:44', data_emissao: '2026-07-01' },
      { codigo_lancamento: 3, synced_at: null, data_emissao: null },
    ];
    const r = diffPendentes(espelho, ['1'], 200);
    expect(r.pendentes).toEqual([{ id: 3, emissao: null }, { id: 2, emissao: '2026-07-01' }]); // sem synced_at primeiro, depois o mais antigo
    expect(r.restantes).toBe(0);
  });

  it('respeita o teto e conta o que sobrou', () => {
    const espelho = Array.from({ length: 5 }, (_, i) => ({ codigo_lancamento: i + 1, synced_at: `2026-0${i + 1}-01` }));
    const r = diffPendentes(espelho, [], 2);
    expect(r.pendentes.map((p) => p.id)).toEqual([1, 2]);
    expect(r.restantes).toBe(3);
  });

  it('ignora ids repetidos e inválidos', () => {
    const r = diffPendentes([{ codigo_lancamento: 7 }, { codigo_lancamento: 7 }, { codigo_lancamento: null as unknown as number }], []);
    expect(r.pendentes.map((p) => p.id)).toEqual([7]);
  });

  it('lista de status aberto é a mesma da tela', () => {
    expect(STATUS_ABERTO).toEqual(['A VENCER', 'ATRASADO', 'VENCE HOJE']);
  });
});

describe('janelasPorEmissao', () => {
  it('agrupa por mês e abre a janela mês-1..mês+1 em DD/MM/YYYY', () => {
    const r = janelasPorEmissao([
      { id: 1, emissao: '2026-07-01' }, { id: 2, emissao: '2026-07-15' }, { id: 3, emissao: '2026-01-10' }, { id: 4, emissao: null },
    ]);
    expect(r.semEmissao).toEqual([4]);
    expect(r.janelas).toEqual([
      { mes: '2026-01', de: '01/12/2025', ate: '28/02/2026', ids: [3] },
      { mes: '2026-07', de: '01/06/2026', ate: '31/08/2026', ids: [1, 2] },
    ]);
  });
  it('vazio', () => {
    expect(janelasPorEmissao([])).toEqual({ janelas: [], semEmissao: [] });
  });
});

describe('detecção de faults', () => {
  it('bloqueio longo da Omie', () => {
    expect(ehBloqueioOmie('ERROR: API bloqueada por consumo indevido. Tente novamente em 1788 segundos.')).toBe(true);
    expect(ehBloqueioOmie('ERROR: Lançamento não cadastrado')).toBe(false);
  });
  it('lista vazia legítima', () => {
    expect(ehListaVazia('ERROR: Não existem registros para a página [1]!')).toBe(true);
    expect(ehListaVazia('ERROR: API bloqueada por consumo indevido')).toBe(false);
  });
});

describe('patchDeTitulo', () => {
  it('só com os campos presentes', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = patchDeTitulo({
      codigo_lancamento_omie: 2148384176,
      status_titulo: 'RECEBIDO',
      valor_documento: 23000,
      data_vencimento: '21/03/2024',
      data_previsao: '30/04/2024',
      data_emissao: '21/03/2024',
      info: { dAlt: '19/08/2026', hAlt: '15:12:16', uAlt: 'P000454175' },
    }, '2026-09-30T12:00:00.000Z');
    expect(p).toMatchObject({
      status_titulo: 'RECEBIDO', valor_documento: 23000, data_vencimento: '2024-03-21', data_previsao: '2024-04-30',
      data_emissao: '2024-03-21', alterado_por: 'P000454175', synced_at: '2026-09-30T12:00:00.000Z',
    });
    expect(p.data_alteracao).toMatch(/^2026-08-19/);
    expect('valor_pago' in p).toBe(false);
    expect('data_pagamento' in p).toBe(false);
    expect('numero_documento' in p).toBe(false);
    expect(p.raw.codigo_lancamento_omie).toBe(2148384176);
  });
});

describe('decidirPendentes', () => {
  const encontrados = new Map<number, unknown>([[10, { status_titulo: 'PAGO' }]]);
  it('presente => atualizar; ausente com janela completa => excluir', () => {
    const r = decidirPendentes([10, 11], encontrados, true);
    expect(r.atualizar.map((a) => a.id)).toEqual([10]);
    expect(r.excluir).toEqual([11]);
    expect(r.indefinidos).toEqual([]);
  });
  it('janela incompleta NUNCA exclui', () => {
    const r = decidirPendentes([10, 11], encontrados, false);
    expect(r.atualizar.map((a) => a.id)).toEqual([10]);
    expect(r.excluir).toEqual([]);
    expect(r.indefinidos).toEqual([11]);
  });
});
