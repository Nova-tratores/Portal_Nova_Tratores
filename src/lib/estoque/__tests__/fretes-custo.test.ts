import { describe, it, expect } from 'vitest';
import { fretesForaDoCusto, valorDoFrete, type MovKardex } from '../fretes-custo';

const mov = (codOrigem: string, extra: Partial<MovKardex> = {}): MovKardex => ({
  data: '20/11/2026', codOrigem, numPedido: null, idDoc: 10, qtdeAnterior: 5, cmcAnterior: 10, cmcAtual: 10, ...extra,
});
const periodo = (antes: number, entrada: number, depois: number) => ({ movPeriodo: [
  { tipo: '1.Anterior', cmcTotal: antes }, { tipo: '2.Entrada', cmcTotal: entrada }, { tipo: '3.Saída', cmcTotal: 0 }, { tipo: '4.Atual', cmcTotal: depois },
] });

describe('frete fora do custo', () => {
  it('valor do frete: entrada do CTR, senão a variação do total', () => {
    expect(valorDoFrete(mov('CTR', { raw: periodo(100, 22.2, 122.2) }))).toBe(22.2);
    expect(valorDoFrete(mov('CTR', { raw: periodo(100, 0, 130) }))).toBe(30);
  });

  it('acha CTR com estoque zerado e CTR antes da NF', () => {
    const movs = [
      mov('CTR', { idDoc: 1, numPedido: '000465486', qtdeAnterior: 0 }),       // zerado
      mov('CTR', { idDoc: 2, numPedido: '9051901' }),                         // antes da NF 2
      mov('COM', { idDoc: 2 }),
      mov('COM', { idDoc: 3 }),
      mov('CTR', { idDoc: 3, numPedido: '777' }),                             // normal
      mov('CTR', { idDoc: 4, numPedido: '888', qtdeAnterior: 0, cancelado: true }),
    ];
    expect(fretesForaDoCusto(movs).map((f) => [f.cteNumero, f.motivo])).toEqual([['465486', 'estoque_zerado'], ['9051901', 'cte_antes_da_nf']]);
  });
});
