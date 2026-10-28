import { describe, it, expect } from 'vitest';
import { validarLotes, resumirApp, ehRotaVendas, type LinhaAppEvento } from './app-vendas';

const HOJE = '2026-10-27';
const lote = (extra: Record<string, unknown>) => ({ lotes: [{ dia: HOJE, paginas: [], transicoes: [], eventos: [], ...extra }] });
const ok = (r: ReturnType<typeof validarLotes>) => {
  if ('erro' in r) throw new Error(r.erro);
  return r;
};

describe('validarLotes', () => {
  it('aceita telas, transições, atalhos e fluxos do app', () => {
    const r = ok(validarLotes(lote({
      paginas: [{ rota: '/vendas/visitas', n: 3 }],
      transicoes: [{ de: '/vendas/dashboard', para: '/vendas/visitas', n: 2, n_volta: 1, n_rapida: 1, n_mesmo_alvo: 0, soma_gap_s: 80 }],
      eventos: [
        { tipo: 'atalho', chave: 'inicio:nova-visita', detalhe: '/vendas/dashboard→/vendas/visitas', n: 1 },
        { tipo: 'atalho', chave: 'menu:ajuda', detalhe: '/vendas/menu→(mesma tela)', n: 1 },
        { tipo: 'fluxo', chave: 'visita', detalhe: 'concluido', n: 1, soma_s: 120 },
      ],
    }), HOJE));
    expect(r.paginas).toEqual([{ rota: '/vendas/visitas', dia: HOJE, n: 3 }]);
    expect(r.transicoes[0]).toMatchObject({ n: 2, n_volta: 1, soma_gap_s: 80 });
    expect(r.eventos).toHaveLength(3);
  });

  it('corpo sem lotes é erro (400)', () => {
    expect(validarLotes({}, HOJE)).toEqual({ erro: expect.any(String) });
  });

  it('só rotas /vendas: não deixa o app escrever nas telas do portal', () => {
    const r = ok(validarLotes(lote({ paginas: [{ rota: '/financeiro', n: 1 }, { rota: '/vendas/x?cnpj=1', n: 1 }] }), HOJE));
    expect(r.paginas).toEqual([]);
  });

  it('descarta dia futuro e dia com mais de 30 dias', () => {
    const r = ok(validarLotes({ lotes: [
      { dia: '2026-10-28', paginas: [{ rota: '/vendas/a', n: 1 }] },
      { dia: '2026-09-20', paginas: [{ rota: '/vendas/a', n: 1 }] },
      { dia: '2026-10-01', paginas: [{ rota: '/vendas/a', n: 1 }] },
    ] }, HOJE));
    expect(r.paginas.map((p) => p.dia)).toEqual(['2026-10-01']);
  });

  it('contadores não passam de n (volta/rápida/mesmo) e o gap tem teto', () => {
    const r = ok(validarLotes(lote({
      transicoes: [{ de: '/vendas/a', para: '/vendas/b', n: 1, n_volta: 50, n_rapida: 9, n_mesmo_alvo: 9, soma_gap_s: 999999 }],
    }), HOJE));
    expect(r.transicoes[0]).toMatchObject({ n_volta: 1, n_rapida: 1, n_mesmo_alvo: 1, soma_gap_s: 1800 });
  });

  it('fluxo e evento desconhecidos são descartados', () => {
    const r = ok(validarLotes(lote({ eventos: [
      { tipo: 'fluxo', chave: 'hack', detalhe: 'concluido', n: 1 },
      { tipo: 'fluxo', chave: 'visita', detalhe: 'explodiu', n: 1 },
      { tipo: 'atalho', chave: 'menu:x', detalhe: '/financeiro→/vendas/a', n: 1 },
    ] }), HOJE));
    expect(r.eventos).toEqual([]);
  });
});

describe('resumirApp', () => {
  const L = (p: Partial<LinhaAppEvento>): LinhaAppEvento => ({ user_id: 'u1', tipo: 'fluxo', chave: 'visita', detalhe: 'iniciado', dia: HOJE, n: 1, soma_s: 0, ...p });

  it('funil do fluxo: % concluído, % abandono e tempo médio até concluir', () => {
    const { fluxos } = resumirApp([
      L({ detalhe: 'iniciado', n: 10 }),
      L({ detalhe: 'concluido', n: 6, soma_s: 600 }),
      L({ detalhe: 'abandonado', n: 3, user_id: 'u2' }),
      L({ detalhe: 'cancelado', n: 1 }),
    ]);
    expect(fluxos[0]).toMatchObject({ fluxo: 'visita', iniciados: 10, concluidos: 6, pctConcluido: 60, pctAbandono: 30, tempoMedioConcluirS: 100, pessoas: 2 });
  });

  it('atalhos por origem→destino, mais usados primeiro', () => {
    const { atalhos } = resumirApp([
      L({ tipo: 'atalho', chave: 'menu:nova-visita', detalhe: '/vendas/menu→/vendas/visitas', n: 2 }),
      L({ tipo: 'atalho', chave: 'inicio:nova-visita', detalhe: '/vendas/dashboard→/vendas/visitas', n: 5 }),
    ]);
    expect(atalhos.map((a) => a.atalho)).toEqual(['inicio:nova-visita', 'menu:nova-visita']);
    expect(atalhos[0]).toMatchObject({ de: '/vendas/dashboard', para: '/vendas/visitas' });
  });

  it('ehRotaVendas', () => {
    expect(ehRotaVendas('/vendas/visitas')).toBe(true);
    expect(ehRotaVendas('/vendasx')).toBe(false);
    expect(ehRotaVendas('/pos')).toBe(false);
  });
});
