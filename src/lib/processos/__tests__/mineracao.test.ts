import { describe, it, expect } from 'vitest';
import { minerarProcesso, eventosDasOS, ordemFasesOS, type EventoProcesso } from '../mineracao';

const ORDEM = ['A', 'B', 'C', 'Fim', 'Cancelada'];
const FINAIS = ['Fim', 'Cancelada'];
const ev = (caso: string, de: string, para: string, h: number, quem = 'Ana', tipo: EventoProcesso['tipo'] = 'pessoa'): EventoProcesso =>
  ({ caso, de, para, quem, tipo, em: new Date(Date.UTC(2026, 9, 1) + h * 3600000).toISOString() });

describe('minerarProcesso', () => {
  const r = minerarProcesso([
    ev('1', 'A', 'B', 0), ev('1', 'B', 'C', 10, 'Bia'), ev('1', 'C', 'Fim', 12, 'Bia'),
    ev('2', 'A', 'B', 0, 'robô', 'robo'), ev('2', 'B', 'A', 4), ev('2', 'A', 'B', 5), ev('2', 'B', 'Cancelada', 7),
    ev('3', 'A', 'B', 1), ev('3', 'B', 'B', 2), // repetida (de = para) é ignorada
  ], { ordem: ORDEM, finais: FINAIS });

  it('conta casos, eventos e robô', () => {
    expect(r.casos).toBe(3);
    expect(r.eventos).toBe(8);
    expect(r.pctRobo).toBeCloseTo(1 / 8);
  });
  it('setas com volume, casos e tempo parado antes de passar', () => {
    const ab = r.setas.find((s) => s.de === 'A' && s.para === 'B')!;
    expect(ab).toMatchObject({ n: 4, casos: 3, robo: 1, volta: false });
    expect(ab.medianaH).toBe(1); // só o caso 2 tem entrada vista em A (4h → 5h)
    expect(r.setas.find((s) => s.de === 'B' && s.para === 'C')!.medianaH).toBe(10);
  });
  it('volta para trás = retrabalho; cancelar nunca é volta', () => {
    expect(r.setas.find((s) => s.de === 'B' && s.para === 'A')!.volta).toBe(true);
    expect(r.setas.find((s) => s.para === 'Cancelada')!.volta).toBe(false);
    expect(r.casosComVolta).toBe(1);
  });
  it('fases: parados agora e quem move', () => {
    const b = r.fases.find((f) => f.fase === 'B')!;
    expect(b.paradosAgora).toBe(1); // caso 3
    expect(b.quemMove[0]).toEqual(['Ana', 2, 'pessoa']);
    expect(r.fases.map((f) => f.fase)).toEqual(['A', 'B', 'C', 'Fim', 'Cancelada']);
  });
  it('caminhos: buraco no histórico mantém a fase de saída', () => {
    const c = minerarProcesso([ev('9', 'A', 'B', 0), ev('9', 'C', 'Fim', 3)], { ordem: ORDEM, finais: FINAIS });
    expect(c.caminhos[0].fases).toEqual(['A', 'B', 'C', 'Fim']);
  });
  it('marco (sem fase anterior) marca a entrada: mede o tempo na 1ª fase e diz quem criou', () => {
    const c = minerarProcesso([
      ev('7', '', 'A', 0, 'Caio'), ev('7', 'A', 'B', 6), ev('7', '', 'B', 7, 'robô', 'robo'), ev('7', 'B', 'C', 9),
    ], { ordem: ORDEM, finais: FINAIS });
    expect(c.eventos).toBe(2); // marcos não contam como troca
    expect(c.setas.find((s) => s.de === 'A')!).toMatchObject({ medianaH: 6, medidas: 1 });
    expect(c.setas.find((s) => s.de === 'B')!.medianaH).toBe(3); // marco repetido na mesma fase não reinicia o relógio
    expect(c.criadores).toEqual([['Caio', 1, 'pessoa']]);
    expect(c.fases.find((f) => f.fase === 'A')!.inicios).toBe(1);
    expect(c.caminhos[0].fases).toEqual(['A', 'B', 'C']);
  });
  it('fase anterior que não é fase de verdade vira a fase em que o caso estava', () => {
    const c = minerarProcesso([ev('5', '', 'A', 0), ev('5', 'A', 'B', 1), ev('5', 'Enviado', 'Fim', 5)], { ordem: ORDEM, finais: FINAIS, fasesReais: ORDEM });
    expect(c.setas.map((s) => `${s.de}>${s.para}`).sort()).toEqual(['A>B', 'B>Fim']);
    expect(c.setas.find((s) => s.de === 'B')!.medianaH).toBe(4);
    const sem = minerarProcesso([ev('6', 'Enviado', 'Fim', 0)], { ordem: ORDEM, finais: FINAIS, fasesReais: ORDEM });
    expect(sem.setas[0].de).toBe('Enviado'); // sem fase conhecida antes: mantém o que foi gravado
  });
  it('fase desconhecida entra antes das finais', () => {
    const c = minerarProcesso([ev('9', 'A', 'X', 0), ev('9', 'X', 'Fim', 1)], { ordem: ORDEM, finais: FINAIS });
    expect(c.fases.map((f) => f.fase)).toEqual(['A', 'X', 'Fim']);
  });
});

describe('eventosDasOS (logs_ppo)', () => {
  const base = { Id_ppo: 'OS-1', acao: 'mudou', Status_Anterior: 'A', Status_Atual: 'B', created_at: '2026-10-01T10:00:00Z' };
  const nomes = { 'antonio.novatratores@gmail.com': 'José Ortiz' };
  it('robôs, e-mail → nome, login compartilhado e grafias juntas', () => {
    const r = eventosDasOS([
      { ...base, UsuEmail: 'Sistema' },
      { ...base, UsuEmail: 'Tratorilson (auto)' },
      { ...base, UsuEmail: 'Fulano', acao: 'Auto-move: previsão atingida' },
      { ...base, UsuEmail: 'antonio.novatratores@gmail.com' },
      { ...base, UsuEmail: 'José Ortiz' },
      { ...base, UsuEmail: 'Jose Ortiz' },
      { ...base, UsuEmail: 'posvendas.novatratores@gmail.com' },
      { ...base, UsuEmail: 'outro@gmail.com' },
    ], nomes);
    expect(r.map((e) => [e.quem, e.tipo])).toEqual([
      ['Automático do portal', 'robo'], ['Tratorilson (robô)', 'robo'], ['Automático do portal', 'robo'],
      ['José Ortiz', 'pessoa'], ['José Ortiz', 'pessoa'], ['José Ortiz', 'pessoa'],
      ['posvendas.novatratores (login compartilhado)', 'compartilhado'], ['outro (login)', 'pessoa'],
    ]);
  });
  it('ordem da OS inclui os nomes antigos', () => {
    const o = ordemFasesOS(['Enviar Omie', 'Enviado Para Omie', 'Cobrando Cliente', 'Preenchido Garantia', 'Concluída']);
    expect(o).toEqual(['Enviar Omie', 'Enviado Para Omie', 'Enviado', 'Cobrando Cliente', 'Preenchido', 'Preenchido Garantia', 'Concluída']);
  });
});
