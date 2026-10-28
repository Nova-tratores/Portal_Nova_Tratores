import { describe, it, expect } from 'vitest';
import { paresParaTentar, proximaTentativa, dataOrdenavel, MAX_TENTATIVAS, type Tentativa } from '../cmc-tentativas';

const agora = new Date('2026-10-28T21:30:00Z');
const dias = (t: Tentativa) => (new Date(t.proxima_em!).getTime() - agora.getTime()) / 86_400_000;

describe('proximaTentativa', () => {
  it('espera 1, 7 e 30 dias e desiste na 4ª', () => {
    const t1 = proximaTentativa(undefined, 'sem_custo', agora);
    expect([t1.tentativas, dias(t1)]).toEqual([1, 1]);
    const t2 = proximaTentativa(t1, 'sem_custo', agora);
    expect([t2.tentativas, dias(t2)]).toEqual([2, 7]);
    const t3 = proximaTentativa(t2, 'sem_custo', agora);
    expect([t3.tentativas, dias(t3)]).toEqual([3, 30]);
    const t4 = proximaTentativa(t3, 'sem_custo', agora);
    expect(t4).toEqual({ tentativas: MAX_TENTATIVAS, proxima_em: null, ultimo_resultado: 'sem_custo_omie' });
  });

  it('erro de chamada não conta tentativa e volta amanhã', () => {
    const t = proximaTentativa({ tentativas: 2, proxima_em: null, ultimo_resultado: 'sem_custo' }, 'erro', agora);
    expect(t.tentativas).toBe(2);
    expect(dias(t)).toBe(1);
    expect(t.ultimo_resultado).toBe('erro');
  });
});

describe('paresParaTentar', () => {
  it('deduplica, tira quem espera ou desistiu e põe os mais recentes primeiro', () => {
    const linhas = [
      { codigo_produto: '1', data_pedido: '04/11/2022' },
      { codigo_produto: '1', data_pedido: '04/11/2022' },
      { codigo_produto: '2', data_pedido: '10/10/2026' },
      { codigo_produto: '3', data_pedido: '01/01/2025' },
      { codigo_produto: '4', data_pedido: '01/01/2024' },
      { codigo_produto: '5', data_pedido: '01/01/2023' },
    ];
    const tentativas = new Map<string, Tentativa>([
      ['4:01/01/2024', { tentativas: 1, proxima_em: '2026-10-30T00:00:00Z', ultimo_resultado: 'sem_custo' }],
      ['5:01/01/2023', { tentativas: 4, proxima_em: null, ultimo_resultado: 'sem_custo_omie' }],
      ['3:01/01/2025', { tentativas: 1, proxima_em: '2026-10-28T00:00:00Z', ultimo_resultado: 'sem_custo' }],
    ]);
    const r = paresParaTentar(linhas, tentativas, agora);
    expect(r.pares.map((p) => p.codigo_produto)).toEqual(['2', '3', '1']);
    expect(r.adiados).toBe(1);
    expect(r.desistidos).toBe(1);
  });

  it('data em outro formato vai pro fim', () => {
    expect(dataOrdenavel('2026-10-01')).toBe(0);
    expect(dataOrdenavel('01/10/2026')).toBe(20261001);
  });
});
