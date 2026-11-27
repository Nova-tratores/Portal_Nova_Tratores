import { describe, it, expect } from 'vitest';
import { diasParada, faixaParada, planejarAvisos, linkAviso, linhaNota, corpoAviso, type NotaParada } from '../recebimentos-esquecidos';

const hoje = new Date(2026, 10, 26, 12); // 26/11/2026
const nota = (id: number, emissao: string, resp: string | null, extra: Partial<NotaParada> = {}): NotaParada => ({
  conta: 'NOVA', idReceb: id, numero: `00000${id}`, fornecedor: 'FORN', valor: 100, emissao, cte: false, responsavelUserId: resp, ...extra,
});

describe('recebimentos esquecidos', () => {
  it('conta os dias nos dois formatos de data', () => {
    expect(diasParada('2026-11-19', hoje)).toBe(7);
    expect(diasParada('19/11/2026', hoje)).toBe(7);
    expect(diasParada('', hoje)).toBeNull();
  });

  it('faixas: <7 recente, 7–90 esquecida, >90 antiga', () => {
    expect(faixaParada(6)).toBe('recente');
    expect(faixaParada(7)).toBe('esquecida');
    expect(faixaParada(90)).toBe('esquecida');
    expect(faixaParada(91)).toBe('antiga');
    expect(faixaParada(null)).toBe('recente');
  });

  it('responsável a partir de 7 dias, gestor a partir de 15, antigas e sem dono à parte', () => {
    const notas = [
      nota(1, '2026-11-24', 'ana'),                 // 2 dias: nada
      nota(2, '2026-11-19', 'ana'),                 // 7: só a Ana
      nota(3, '2026-11-01', 'ana', { cte: true }),  // 25: Ana + gestor
      nota(4, '2026-06-01', 'ana'),                 // >90: fora
      nota(5, '2026-11-10', null),                  // sem dono
      nota(6, '2026-11-01', 'chefe'),               // gestor de si mesmo não recebe 2x
    ];
    const gestor = (id: string) => (id === 'ana' || id === 'chefe' ? 'chefe' : null);
    const p = planejarAvisos(notas, hoje, gestor, (id) => id.toUpperCase());
    expect(p.responsavel.get('ana')!.map((l) => l.nota.idReceb)).toEqual([3, 2]); // mais antiga primeiro
    expect(p.gestor.get('chefe')!.map((x) => [x.quem, x.l.nota.idReceb])).toEqual([['ANA', 3]]);
    expect(p.semDono.map((l) => l.nota.idReceb)).toEqual([5]);
    expect(p.antigas).toBe(1);
  });

  it('textos e links', () => {
    const l = { nota: nota(474988, '2026-11-01', 'ana', { cte: true, fornecedor: 'EXPRESSO SAO MIGUEL S/A', valor: 129.03 }), dias: 25 };
    expect(linhaNota(l)).toBe('CT-e 474988 · NOVA · EXPRESSO SAO MIGUEL S/A · R$ 129,03 · 25 dias');
    expect(linkAviso([l])).toBe('/estoque/recebimentos?conta=NOVA&nota=474988');
    expect(linkAviso([l, { ...l, nota: { ...l.nota, conta: 'CASTRO' } }])).toBe('/estoque/recebimentos?idade=esquecidas');
    expect(corpoAviso(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).split('\n').pop()).toBe('e mais 2');
  });
});
