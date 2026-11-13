import { describe, expect, it } from 'vitest';
import { selosPorTela } from '../origem-tela';

describe('selosPorTela', () => {
  it('departamento, gerir herdado e exceção com motivo', () => {
    const s = selosPorTela(
      [
        { id: 'ppv', origens: ['conjunto:Peças'] },
        { id: 'ppv:faturar', origens: ['conjunto:Peças · gerir ppv', 'extra'] },
        { id: 'pos', origens: ['extra até 31/12/2026'] },
      ],
      [{ tela_id: 'ppv:faturar', tipo: 'extra', motivo: 'Pedido do gestor' }],
    );
    expect(s.ppv).toEqual([{ texto: 'Peças', tipo: 'conjunto', dica: 'Vem de "Peças"' }]);
    expect(s['ppv:faturar'].map((x) => x.texto)).toEqual(['Peças', 'exceção']);
    expect(s['ppv:faturar'][1].dica).toBe('Exceção: Pedido do gestor');
    expect(s.pos[0].texto).toBe('exceção até 31/12/2026');
  });

  it('bloqueio vigente vira selo; vencido não', () => {
    const s = selosPorTela([], [
      { tela_id: 'frota', tipo: 'bloqueio', motivo: 'Saiu do setor' },
      { tela_id: 'pos', tipo: 'bloqueio', expira_em: '2000-01-01T00:00:00Z' },
    ]);
    expect(s.frota).toEqual([{ texto: 'bloqueada', tipo: 'bloqueio', dica: 'Bloqueada: Saiu do setor' }]);
    expect(s.pos).toBeUndefined();
  });

  it('admin/dev não ganham selo', () => {
    expect(selosPorTela([{ id: 'x', origens: ['admin'] }], [])).toEqual({});
  });
});
