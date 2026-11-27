import { describe, it, expect } from 'vitest';
import { candidatasDoFrete, fretesDaNota, notaDoResponsavel, avaliarTravaFrete, type NotaEspelho } from '../frete-vinculo';

const CTE_CHAVE = '35261157634677000107570010027397691523122975';
const NFE_CHAVE = '35261152783321000103550010000123451000000001';
const n = (id: number, emissao: string, extra: Partial<NotaEspelho> = {}): NotaEspelho => ({
  idReceb: id, numero: String(id), chave: NFE_CHAVE, emissao, cnpj: '52.783.321/0001-03', fornecedor: 'INCOMAGRI', valor: 100, status: 'Recebida', ...extra,
});
const cte = n(900, '2026-11-18', { chave: CTE_CHAVE, status: 'Faturada' });

describe('frete ↔ nota', () => {
  it('candidatas: mesmo remetente, 10 dias antes a 2 depois, mais perto primeiro', () => {
    const notas = [
      n(1, '2026-11-17'), n(2, '18/11/2026'), n(3, '2026-11-05'), n(4, '2026-11-21'),
      n(5, '2026-11-18', { cnpj: '11.111.111/0001-11' }), n(6, '2026-11-18', { status: 'Cancelada' }),
      n(7, '2026-11-18', { chave: CTE_CHAVE }),
    ];
    expect(candidatasDoFrete(cte, notas).map((c) => c.idReceb)).toEqual([2, 1]);
  });

  it('fretes da nota: CT-e pendente na janela ou já ligado', () => {
    const nf = n(1, '2026-11-17');
    const outro = { ...cte, idReceb: 901, status: 'Recebida' };
    expect(fretesDaNota(nf, [cte, outro], new Set()).map((t) => t.idReceb)).toEqual([900]);
    expect(fretesDaNota(nf, [cte, outro], new Set([901])).map((t) => t.idReceb)).toEqual([901, 900]);
  });

  it('responsável: a ligada; senão a única candidata', () => {
    expect(notaDoResponsavel([5], [])).toBe(5);
    expect(notaDoResponsavel([], candidatasDoFrete(cte, [n(1, '2026-11-17')]))).toBe(1);
    expect(notaDoResponsavel([], candidatasDoFrete(cte, [n(1, '2026-11-17'), n(2, '2026-11-16')]))).toBeNull();
  });

  it('trava: sem nota, nota pendente, data ajustada', () => {
    expect(avaliarTravaFrete({ ligadas: [], semNotaMotivo: null, dRegistroCte: null }).ok).toBe(false);
    expect(avaliarTravaFrete({ ligadas: [], semNotaMotivo: 'frete de devolução', dRegistroCte: '20/11/2026' }))
      .toEqual({ ok: true, dRegistro: '20/11/2026', ajustada: false });
    const pend = avaliarTravaFrete({ ligadas: [{ idReceb: 1, numero: '000123', recebida: false, dRegistro: null }], semNotaMotivo: null, dRegistroCte: null });
    expect(pend.ok).toBe(false);
    if (!pend.ok) expect(pend.erro).toContain('nota de produto 123');
    expect(avaliarTravaFrete({ ligadas: [{ idReceb: 1, numero: '1', recebida: true, dRegistro: '25/11/2026' }], semNotaMotivo: null, dRegistroCte: '20/11/2026' }))
      .toEqual({ ok: true, dRegistro: '25/11/2026', ajustada: true });
    expect(avaliarTravaFrete({ ligadas: [{ idReceb: 1, numero: '1', recebida: true, dRegistro: '19/11/2026' }], semNotaMotivo: null, dRegistroCte: '2026-11-20' }))
      .toEqual({ ok: true, dRegistro: '20/11/2026', ajustada: false });
  });
});
