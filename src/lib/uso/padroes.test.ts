import { describe, it, expect } from 'vitest';
import { paresDeTelas, sequenciasDeAcoes, resumirPadroes, fluxoDaTela, semanaDe, scorePar, type LinhaTransicao, type EventoAudit } from './padroes';

const t = (o: Partial<LinhaTransicao>): LinhaTransicao => ({ user_id: 'u1', de: '/a', para: '/b', dia: '2026-10-14', n: 1, n_mesmo_alvo: 0, n_volta: 0, n_rapida: 0, soma_gap_s: 60, ...o });
const nomes = new Map([['u1', 'Ana Souza'], ['u2', 'Beto Lima']]);

describe('semanaDe', () => {
  it('devolve a segunda-feira', () => {
    expect(semanaDe('2026-10-17')).toBe('2026-10-12'); // sábado → segunda
    expect(semanaDe('2026-10-12')).toBe('2026-10-12');
  });
});

describe('paresDeTelas', () => {
  it('soma por par, conta pessoas e % de saída', () => {
    const p = paresDeTelas([
      t({ n: 3, n_mesmo_alvo: 2, n_volta: 1, soma_gap_s: 90 }),
      t({ user_id: 'u2', n: 1, n_mesmo_alvo: 1, soma_gap_s: 30 }),
      t({ para: '/c', n: 4 }),
    ], nomes);
    const ab = p.find((x) => x.chave === '/a→/b')!;
    expect(ab.n).toBe(4);
    expect(ab.pessoas).toBe(2);
    expect(ab.pctSaida).toBe(50);
    expect(ab.pctMesmo).toBe(75);
    expect(ab.gapMedioS).toBe(30);
    expect(ab.nomes).toEqual(['Ana', 'Beto']);
    expect(p[0].chave).toBe('/a→/b'); // maior score primeiro
  });
  it('hub não pontua', () => {
    const p = paresDeTelas([t({ de: '/dashboard', n: 50, n_mesmo_alvo: 50 })], nomes);
    expect(p[0].hub).toBe(true);
    expect(p[0].score).toBe(0);
  });
  it('score pesa ida-e-volta em dobro e pessoas pela raiz', () => {
    expect(scorePar(2, 1, 4, false)).toBe(8);
  });
});

describe('sequenciasDeAcoes', () => {
  const ev = (min: number, sistema: string, entidade: string | null, acao = 'editar', user_id = 'u1'): EventoAudit =>
    ({ user_id, sistema, acao, entidade, created_at: new Date(Date.UTC(2026, 9, 14, 13, min)).toISOString() });
  it('colapsa ações na mesma entidade e conta a passagem para outra', () => {
    const { seqs } = sequenciasDeAcoes([
      ev(0, 'revisoes', 'trator'), ev(2, 'revisoes', 'trator'),
      ev(5, 'requisicoes', 'requisicao'), ev(6, 'requisicoes', 'requisicao'),
    ], nomes);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].chave).toBe('ent:revisoes/trator→requisicoes/requisicao');
    expect(seqs[0].gapMedioS).toBe(180);
  });
  it('ignora acesso, robôs e intervalo > 30 min', () => {
    const { seqs } = sequenciasDeAcoes([
      ev(0, 'pos', null, 'acesso'), ev(1, 'pos', 'os'),
      ev(40, 'ppv', 'pedido'),
      ev(41, 'x', 'y', 'editar', '00000000-0000-0000-0000-000000000000'),
    ], nomes);
    expect(seqs).toHaveLength(0);
  });
});

describe('resumirPadroes', () => {
  it('monta cards só do que é relevante e aplica o status salvo', () => {
    const r = resumirPadroes({
      transicoes: [
        t({ n: 6, n_mesmo_alvo: 4, n_volta: 3 }),
        t({ de: '/x', para: '/y', n: 1, n_mesmo_alvo: 1 }), // 1× por 1 pessoa: não vira card
      ],
      eventos: [],
      oportunidades: [{ chave: '/a→/b', status: 'feito', nota: 'resumo na tela A', feito_em: '2026-10-14', por: 'Henri' }],
      usuarios: [{ id: 'u1', nome: 'Ana' }],
      de: '2026-10-01', ate: '2026-10-17',
    });
    expect(r.cards.map((c) => c.chave)).toEqual(['/a→/b']);
    expect(r.cards[0].status).toBe('feito');
    expect(r.cards[0].serie.length).toBe(3);
    expect(r.cards[0].sugestao).toMatch(/volta/);
    expect(r.totais.transicoes).toBe(7);
    expect(r.telas).toEqual(['/a', '/b', '/x', '/y']);
  });
});

describe('fluxoDaTela', () => {
  it('separa de onde vem e para onde vai', () => {
    const f = fluxoDaTela([t({ de: '/a', para: '/b', n: 2 }), t({ de: '/c', para: '/a', n: 5 })], '/a');
    expect(f.entradas).toEqual([{ rota: '/c', n: 5 }]);
    expect(f.saidas).toEqual([{ rota: '/b', n: 2 }]);
  });
});
