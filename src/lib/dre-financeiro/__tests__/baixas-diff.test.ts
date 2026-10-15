import { describe, it, expect } from 'vitest';
import { filtrarBaixasAlteradas, normData, normValor, fatias } from '../baixas-diff.js';

describe('normData / normValor', () => {
  it('aceita Date, ISO, timestamp e DD/MM/YYYY', () => {
    expect(normData('2026-10-15')).toBe('2026-10-15');
    expect(normData('2026-10-15T00:00:00+00:00')).toBe('2026-10-15');
    expect(normData('15/10/2026')).toBe('2026-10-15');
    expect(normData(new Date(Date.UTC(2026, 9, 15)))).toBe('2026-10-15');
    expect(normData(null)).toBeNull();
    expect(normData('')).toBeNull();
  });
  it('compara centavos e aceita vírgula', () => {
    expect(normValor(1234.5)).toBe(1234.5);
    expect(normValor('1234,50')).toBe(1234.5);
    expect(normValor(0.1 + 0.2)).toBe(0.3);
    expect(normValor(null)).toBeNull();
  });
});

describe('filtrarBaixasAlteradas', () => {
  const espelho = [
    { codigo_lancamento: 1, data_pagamento: '2026-10-01', valor_pago: 100 },
    { codigo_lancamento: 2, data_pagamento: '2026-10-02', valor_pago: '250.00' },
    { codigo_lancamento: 3, data_pagamento: null, valor_pago: null },
  ];
  it('só o que mudou vai para UPDATE; igual conta como igual; sem espelho também grava', () => {
    const r = filtrarBaixasAlteradas(
      [
        { codigo_lancamento: 1, data_pagamento: '2026-10-01', valor_pago: 100.0 },      // igual
        { codigo_lancamento: '2', data_pagamento: '2026-10-02', valor_pago: 250 },      // igual (string × número)
        { codigo_lancamento: 3, data_pagamento: '2026-10-10', valor_pago: 10 },         // mudou (era aberto)
        { codigo_lancamento: 4, data_pagamento: '2026-10-11', valor_pago: 5 },          // não está no espelho
      ],
      espelho
    );
    expect(r.iguais).toBe(2);
    expect(r.semEspelho).toBe(1);
    expect(r.alteradas.map((x) => x.codigo_lancamento)).toEqual([3, 4]);
  });
  it('diferença de centavos ou de data conta como alteração', () => {
    const r = filtrarBaixasAlteradas(
      [
        { codigo_lancamento: 1, data_pagamento: '2026-10-01', valor_pago: 100.01 },
        { codigo_lancamento: 2, data_pagamento: '2026-10-03', valor_pago: 250 },
      ],
      espelho
    );
    expect(r.alteradas).toHaveLength(2);
    expect(r.iguais).toBe(0);
  });
  it('listas vazias', () => {
    expect(filtrarBaixasAlteradas([], espelho)).toEqual({ alteradas: [], iguais: 0, semEspelho: 0 });
    expect(filtrarBaixasAlteradas([{ codigo_lancamento: 9, data_pagamento: '2026-01-01', valor_pago: 1 }], []).alteradas).toHaveLength(1);
  });
});

describe('fatias', () => {
  it('divide em pedaços de n', () => {
    expect(fatias([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(fatias([], 3)).toEqual([]);
  });
});
