import { describe, expect, it } from 'vitest';
import { espelhoAposBaixa } from './baixa-espelho';

const base = { tipo: 'pagar' as const, dataISO: '2026-11-10' };

describe('espelhoAposBaixa', () => {
  it('usa o que a Omie diz depois da baixa (parcial continua em aberto)', () => {
    const r = espelhoAposBaixa({ ...base, valorBaixa: 400, antes: { status_titulo: 'A VENCER', valor_documento: 1000, valor_pago: 0 }, omie: { status_titulo: 'A VENCER', valor_pago: 400 } });
    expect(r).toEqual({ update: { status_titulo: 'A VENCER', valor_pago: 400, data_pagamento: '2026-11-10' }, liquidou: false, fonte: 'omie' });
  });
  it('Omie liquidou: PAGO com o valor acumulado da Omie', () => {
    const r = espelhoAposBaixa({ ...base, valorBaixa: 600, antes: { valor_documento: 1000, valor_pago: 400 }, omie: { status_titulo: 'pago', valor_pago: 1000 } });
    expect(r.update).toEqual({ status_titulo: 'PAGO', valor_pago: 1000, data_pagamento: '2026-11-10' });
    expect(r.liquidou).toBe(true);
  });
  it('sem releitura: baixa parcial não marca PAGO e soma ao já pago', () => {
    const r = espelhoAposBaixa({ ...base, valorBaixa: 300, antes: { status_titulo: 'ATRASADO', valor_documento: 1000, valor_pago: 200 }, omie: null });
    expect(r).toEqual({ update: { valor_pago: 500, data_pagamento: '2026-11-10' }, liquidou: false, fonte: 'calculo' });
  });
  it('sem releitura: cobrir o saldo (com desconto) liquida', () => {
    const r = espelhoAposBaixa({ ...base, tipo: 'receber', valorBaixa: 790, desconto: 10, antes: { valor_documento: 1000, valor_pago: 200 }, omie: null });
    expect(r.update.status_titulo).toBe('RECEBIDO');
    expect(r.update.valor_pago).toBe(990);
  });
  it('sem valor do documento no espelho: comportamento antigo (liquida)', () => {
    const r = espelhoAposBaixa({ ...base, valorBaixa: 50, antes: null, omie: null });
    expect(r.update).toEqual({ status_titulo: 'PAGO', valor_pago: 50, data_pagamento: '2026-11-10' });
  });
  it('Omie sem valor_pago na resposta: soma ao espelho', () => {
    const r = espelhoAposBaixa({ ...base, valorBaixa: 100, antes: { valor_pago: 50 }, omie: { status_titulo: 'A VENCER' } });
    expect(r.update.valor_pago).toBe(150);
  });
});
