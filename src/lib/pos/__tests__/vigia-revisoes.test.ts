import { describe, it, expect } from 'vitest';
import {
  avaliarOS, normalizarHorasRevisao, detalhesNovos, mesmaPendencia, dataLimite, diasDesde, parseData, osFaturada,
} from '../vigia-revisoes-regras';
import { extrairHorasRevisaoOS, extrairChassis } from '../extrairTrator';

const HOJE = new Date(2026, 8, 28, 12); // 28/09/2026
const CH = 'MDI07513LS0006165';

describe('extrairHorasRevisaoOS', () => {
  it('lê do campo Revisao quando preenchido', () => {
    expect(extrairHorasRevisaoOS({ Revisao: 'Revisão de 300 horas 6075 - Troca...' })).toBe(300);
  });
  it('lê da solicitação quando o campo Revisao está vazio', () => {
    expect(extrairHorasRevisaoOS({ Revisao: '', Serv_Solicitado: 'Modelo: 6075E\nChassis: CAB MDI0751\nHorimetro: \n\nSolicitação do cliente: REV 900H\nServiço Realizado: ...' })).toBe(900);
    expect(extrairHorasRevisaoOS({ Serv_Solicitado: 'Solicitação do cliente: Revisão de 2400' })).toBe(2400);
    expect(extrairHorasRevisaoOS({ Serv_Solicitado: 'rev. 600 hs no trator' })).toBe(600);
  });
  it('horímetro solto não vira revisão', () => {
    expect(extrairHorasRevisaoOS({ Serv_Solicitado: 'Horimetro: 609\nSolicitação do cliente: troca de embreagem' })).toBeNull();
  });
});

describe('extrairChassis', () => {
  it('pega o chassi mesmo com o prefixo CAB do projeto', () => {
    expect(extrairChassis({ Projeto: '6075E CAB MDI07513LS0006165' })).toBe(CH);
  });
});

describe('normalizarHorasRevisao', () => {
  it('mantém as do plano e aproxima as soltas', () => {
    expect(normalizarHorasRevisao(900)).toBe(900);
    expect(normalizarHorasRevisao(1000)).toBe(900);
    expect(normalizarHorasRevisao(2450)).toBe(2400);
    expect(normalizarHorasRevisao(5000)).toBeNull();
    expect(normalizarHorasRevisao(null)).toBeNull();
  });
});

describe('osFaturada', () => {
  it('reconhece o número do Omie nos formatos que aparecem', () => {
    expect(osFaturada('000000000005069')).toBe(true);
    expect(osFaturada('4506')).toBe(true);
    expect(osFaturada(null, 5069)).toBe(true);
    expect(osFaturada(null, null)).toBe(false);
    expect(osFaturada('', '')).toBe(false);
    expect(osFaturada('000000000000000', 0)).toBe(false);
  });
});

describe('avaliarOS', () => {
  const base = { chassis: CH, hoje: HOJE };

  it('revisão faturada sem cheque → pendência com os dias desde a conclusão', () => {
    const p = avaliarOS({ ...base, os: { id: 'OS-1', status: 'Concluída', faturada: true, data: '2026-06-23', dataFim: '2026-06-24' }, horas: 900, enviadas: new Set([50, 300, 600]) });
    expect(p?.detalhes).toEqual(['Cheque de revisão 900h não enviado (OS faturada — serviço concluído há 96 dias)']);
    expect(p?.chassis).toBe(CH);
  });

  it('revisão faturada com cheque enviado → ok', () => {
    const p = avaliarOS({ ...base, os: { id: 'OS-1', status: 'Concluída', faturada: true, data: '2026-06-23' }, horas: 900, enviadas: new Set([900]) });
    expect(p).toBeNull();
  });

  it('não faturada (em aberto ou cortesia) → sem pendência, mesmo concluída', () => {
    const aberta = avaliarOS({ ...base, os: { id: 'OS-1', status: 'Execução', faturada: false, data: '2026-08-01' }, horas: 900, enviadas: new Set() });
    expect(aberta).toBeNull();
    const cortesia = avaliarOS({ ...base, os: { id: 'OS-1', status: 'Concluída', faturada: false, data: '2026-05-18' }, horas: 600, enviadas: new Set() });
    expect(cortesia).toBeNull();
  });

  it('revisões anteriores não entram: só a da própria OS', () => {
    const p = avaliarOS({ ...base, os: { id: 'OS-1', status: 'Concluída', faturada: true, data: '2026-09-01' }, horas: 900, enviadas: new Set([900]) });
    expect(p).toBeNull();
  });

  it('OS que não é de revisão, ou cancelada, não gera pendência', () => {
    expect(avaliarOS({ ...base, os: { id: 'OS-1', status: 'Concluída', faturada: true, data: '2026-09-01' }, horas: null, enviadas: new Set() })).toBeNull();
    expect(avaliarOS({ ...base, os: { id: 'OS-1', status: 'Cancelada', faturada: true, data: '2026-09-01' }, horas: 900, enviadas: new Set() })).toBeNull();
  });

  it('sem data nenhuma o texto sai sem o contador', () => {
    const p = avaliarOS({ ...base, os: { id: 'OS-1', status: 'Concluída', faturada: true }, horas: 50, enviadas: new Set() });
    expect(p?.detalhes).toEqual(['Cheque de revisão 50h não enviado (OS faturada)']);
  });
});

describe('diff de pendências', () => {
  const a = { motivo: 'x', chassis: CH, detalhes: ['Cheque de revisão 900h não enviado (OS faturada — serviço concluído há 8 dias)'] };
  const b = { motivo: 'x', chassis: CH, detalhes: ['Cheque de revisão 900h não enviado (OS faturada — serviço concluído há 9 dias)'] };
  it('o contador de dias não conta como mudança', () => {
    expect(mesmaPendencia(a, b)).toBe(true);
    expect(detalhesNovos(a, b)).toEqual([]);
  });
  it('pendência que apareceu é detectada', () => {
    expect(mesmaPendencia(null, b)).toBe(false);
    expect(detalhesNovos(null, b)).toHaveLength(1);
    expect(mesmaPendencia(a, null)).toBe(false);
    expect(detalhesNovos(a, null)).toEqual([]);
  });
});

describe('datas', () => {
  it('janela de 60 dias, dias desde, dois formatos', () => {
    expect(dataLimite(HOJE, 60)).toBe('2026-07-30');
    expect(diasDesde('2026-09-21', HOJE)).toBe(7);
    expect(diasDesde('21/09/2026', HOJE)).toBe(7);
    expect(diasDesde(null, HOJE)).toBeNull();
    expect(parseData('31/10/2023')?.getFullYear()).toBe(2023);
    expect(parseData('abc')).toBeNull();
  });
});
