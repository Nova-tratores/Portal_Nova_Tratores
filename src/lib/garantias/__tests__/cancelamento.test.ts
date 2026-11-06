import { describe, it, expect } from 'vitest';
import { detalheCancelamento, statusAoDesfazer, ultimoCancelamento, validarCancelamento } from '../cancelamento';

describe('cancelamento de garantia', () => {
  it('exige motivo e explicação no "outro"', () => {
    expect(validarCancelamento('', '').ok).toBe(false);
    expect(validarCancelamento('outro', 'abc').ok).toBe(false);
    expect(validarCancelamento('outro', 'cliente desistiu')).toEqual({ ok: true, motivo: 'outro', obs: 'cliente desistiu' });
    expect(validarCancelamento('teste', '')).toEqual({ ok: true, motivo: 'teste', obs: '' });
  });

  it('acha o último cancelamento por motivo (ignora o de duplicação)', () => {
    const evs = [
      { tipo: 'cancelada', detalhe: 'Cancelada por DUPLICAÇÃO — …', status_anterior: 'enviada', created_at: '2026-11-06T12:00:00Z' },
      { tipo: 'cancelada', detalhe: detalheCancelamento('teste', ''), status_anterior: 'aprovada', created_at: '2026-11-05T12:00:00Z' },
      { tipo: 'cancelada', detalhe: detalheCancelamento('engano', 'OS errada'), status_anterior: 'aberta', created_at: '2026-11-01T12:00:00Z' },
    ];
    const ev = ultimoCancelamento(evs);
    expect(ev?.status_anterior).toBe('aprovada');
    expect(ev?.detalhe).toBe('Cancelada — Criada só para teste');
  });

  it('desfazer volta ao status de antes (ou Em análise)', () => {
    expect(statusAoDesfazer('aprovada')).toBe('aprovada');
    expect(statusAoDesfazer('cancelada')).toBe('em_analise');
    expect(statusAoDesfazer(null)).toBe('em_analise');
  });
});
