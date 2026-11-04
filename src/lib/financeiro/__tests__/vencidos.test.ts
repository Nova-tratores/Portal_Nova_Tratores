import { describe, it, expect } from 'vitest';
import {
  dataLocal, hojeLocal, entraEmVencidos, diasDeAtraso, ehBoleto30,
  parcelaVencidaSemComprovante, resumoDashboard, dataDiasAtras,
} from '../vencidos';

const hoje = new Date(2026, 9, 29); // 29/10/2026 local

describe('dataLocal', () => {
  it('lê AAAA-MM-DD como meia-noite local (não vira o dia anterior)', () => {
    const d = dataLocal('2026-10-29')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 29, 0]);
  });
  it('vazio/inválido → null', () => {
    expect(dataLocal('')).toBeNull();
    expect(dataLocal(null)).toBeNull();
    expect(dataLocal('29/10/2026')).toBeNull();
  });
  it('hojeLocal zera a hora', () => {
    expect(hojeLocal(new Date(2026, 9, 29, 23, 59)).getTime()).toBe(hoje.getTime());
  });
});

describe('entraEmVencidos', () => {
  const base = { status: 'aguardando_vencimento', forma_pagamento: 'Boleto à vista' };
  it('vence hoje NÃO está vencido; ontem está, com 1 dia de atraso', () => {
    expect(entraEmVencidos({ ...base, vencimento_boleto: '2026-10-29' }, hoje)).toBe(false);
    const c = { ...base, vencimento_boleto: '2026-10-28' };
    expect(entraEmVencidos(c, hoje)).toBe(true);
    expect(diasDeAtraso(c, hoje)).toBe(1);
  });
  it('status vencido sempre entra; agrupado nunca', () => {
    expect(entraEmVencidos({ status: 'vencido', vencimento_boleto: '2026-12-01' }, hoje)).toBe(true);
    expect(entraEmVencidos({ status: 'vencido', grupo_pai_id: 5 }, hoje)).toBe(false);
  });
  it('pix, cartão, cheque e Boleto 30 dias (qualquer caixa) ficam fora', () => {
    for (const f of ['Pix', 'Cartão a vista', 'Cartão Parcelado', 'Cheque', 'Boleto 30 dias', 'BOLETO 30 DIAS', 'boleto 30dias']) {
      expect(entraEmVencidos({ ...base, forma_pagamento: f, vencimento_boleto: '2026-01-01' }, hoje)).toBe(false);
    }
    expect(ehBoleto30('Boleto 30 dias ')).toBe(true);
    expect(ehBoleto30('Boleto 30/60 dias')).toBe(false);
  });
  it('parcelado: p1 vencida com comprovante não entra; p2 vencida sem comprovante entra', () => {
    const c = {
      ...base, forma_pagamento: 'Boleto Parcelado', qtd_parcelas: 3,
      vencimento_boleto: '2026-09-01', datas_parcelas: '2026-10-01, 2026-11-01',
      comprovante_pagamento_p1: 'url',
    };
    expect(parcelaVencidaSemComprovante(c, hoje)).toEqual({ num: 2, data: '2026-10-01' });
    expect(entraEmVencidos(c, hoje)).toBe(true);
    expect(diasDeAtraso(c, hoje)).toBe(28);
    expect(entraEmVencidos({ ...c, comprovante_pagamento_p2: 'url' }, hoje)).toBe(false);
  });
  it('parcelado aceita o comprovante antigo da p1 e a p1 repetida em datas_parcelas', () => {
    const c = {
      ...base, forma_pagamento: 'Boleto Parcelado', qtd_parcelas: 2,
      vencimento_boleto: '2026-09-01', datas_parcelas: '2026-09-01, 2026-12-01',
      comprovante_pagamento: 'url',
    };
    expect(entraEmVencidos(c, hoje)).toBe(false);
  });
});

describe('resumoDashboard', () => {
  it('excluído não conta em aberto nem no total', () => {
    const r = resumoDashboard([
      { status: 'gerar_boleto', valor_servico: 10 },
      { status: 'excluido', valor_servico: 99 },
      { status: 'pago', valor_servico: '20.5' },
      { status: 'concluido', valor_servico: 1 },
      { status: 'vencido', grupo_pai_id: 3 },
    ]);
    expect(r.totalBoletos).toBe(3);
    expect(r.boletosEmAberto).toBe(2);
    expect(r.boletosConfirmados).toBe(2);
    expect(r.totalFaturado).toBeCloseTo(21.5);
    expect(r.statusCount.excluido).toBeUndefined();
  });
});

describe('dataDiasAtras', () => {
  it('devolve AAAA-MM-DD local', () => {
    expect(dataDiasAtras(60, new Date(2026, 9, 29, 22, 0))).toBe('2026-08-30');
  });
});
