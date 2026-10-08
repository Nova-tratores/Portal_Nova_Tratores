import { describe, it, expect } from 'vitest';
import { lerDataBR, dataReferencia, mesReferencia, planejarGravacao } from './vendas-referencia';

const p = (numero_pedido: string, data_pedido: string, data_faturamento?: string | null) => ({ numero_pedido, data_pedido, data_faturamento });

describe('lerDataBR', () => {
  it('lê DD/MM/AAAA e recusa lixo', () => {
    expect(lerDataBR('13/04/2026')).toEqual({ dia: 13, mes: 4, ano: 2026 });
    expect(lerDataBR('2026-04-13')).toBeNull();
    expect(lerDataBR('')).toBeNull();
    expect(lerDataBR('31/13/2026')).toBeNull();
  });
});

describe('dataReferencia / mesReferencia', () => {
  it('usa o faturamento quando existe (caso real NOVA 6823: incluído 18/03, faturado 13/04)', () => {
    expect(dataReferencia(p('6823', '18/03/2026', '13/04/2026'))).toBe('13/04/2026');
    expect(mesReferencia(p('6823', '18/03/2026', '13/04/2026'))).toEqual({ mes: 4, ano: 2026 });
  });
  it('sem faturamento cai na data do pedido (previsão/inclusão)', () => {
    expect(mesReferencia(p('1', '30/03/2026', null))).toEqual({ mes: 3, ano: 2026 });
    expect(mesReferencia(p('1', '30/03/2026', ''))).toEqual({ mes: 3, ano: 2026 });
  });
  it('sem data nenhuma → null', () => {
    expect(mesReferencia(p('1', '', null))).toBeNull();
  });
});

describe('planejarGravacao', () => {
  it('sync do mês: pedido faturado em outro mês fica fora e NÃO é apagado', () => {
    // NOVA 6872: faturado 30/03, alterado 11/05 — voltava no sync de maio e duplicava.
    const r = planejarGravacao([p('6872', '30/03/2026', '30/03/2026'), p('7200', '05/05/2026', '06/05/2026')], [], [{ mes: 5, ano: 2026 }]);
    expect([...r.porMes.keys()]).toEqual(['2026-05']);
    expect([...r.numerosApagar]).toEqual(['7200']);
    expect(r.foraDoEscopo).toBe(1);
  });

  it('delta (escopo livre): pedido de mês passado volta para o mês dele e é apagado onde estiver', () => {
    const r = planejarGravacao([p('7087', '12/05/2026', '12/05/2026'), p('7300', '08/10/2026', '08/10/2026')], [], null);
    expect([...r.porMes.keys()].sort()).toEqual(['2026-05', '2026-10']);
    expect([...r.numerosApagar].sort()).toEqual(['7087', '7300']);
  });

  it('descartados (cancelado / não faturado) entram na lista de apagar', () => {
    // NOVA 5710: faturado e depois cancelado — continuava contando.
    const r = planejarGravacao([], ['5710'], null);
    expect([...r.numerosApagar]).toEqual(['5710']);
    expect(r.porMes.size).toBe(0);
  });

  it('itens do mesmo pedido ficam juntos no mesmo mês', () => {
    const r = planejarGravacao([p('9', '28/02/2026', '02/03/2026'), p('9', '28/02/2026', '02/03/2026')], [], null);
    expect(r.porMes.get('2026-03')?.itens.length).toBe(2);
    expect(r.numerosApagar.size).toBe(1);
  });
});
