import { describe, expect, it } from 'vitest';
import { avisosManha, avisosTarde, diaBR, semRetornoJustificado, type VisitaAviso } from '../push-avisos';

const nome = (id: number) => ({ 1: 'Sítio A', 2: 'Fazenda B', 3: 'Chácara C' } as Record<number, string>)[id] || `#${id}`;
const v = (o: Partial<VisitaAviso>): VisitaAviso => ({ id: 1, vendedor_id: 28, propriedade_id: 1, data_visita: '2026-11-26T13:00:00Z', data_proximo_contato: null, proximos_passos: null, ...o });

describe('push-avisos', () => {
  it('sem retorno precisa de motivo', () => {
    expect(semRetornoJustificado('Sem retorno: ,')).toBe(false);
    expect(semRetornoJustificado('Sem retorno: cliente vendeu a fazenda')).toBe(true);
    expect(semRetornoJustificado('Ligar dia 4')).toBe(false);
  });

  it('dia em Brasília', () => {
    expect(diaBR('2026-11-27T01:30:00Z')).toBe('2026-11-26');
    expect(diaBR('2026-11-27T03:30:00Z')).toBe('2026-11-27');
  });

  it('manhã usa a última visita de cada propriedade', () => {
    const r = avisosManha([
      v({ id: 1, propriedade_id: 1, data_visita: '2026-11-20T12:00:00Z', data_proximo_contato: '2026-11-26' }),
      v({ id: 2, propriedade_id: 2, data_visita: '2026-11-10T12:00:00Z', data_proximo_contato: '2026-11-26' }),
      v({ id: 3, propriedade_id: 2, data_visita: '2026-11-24T12:00:00Z', data_proximo_contato: '2026-12-10' }), // remarcou
      v({ id: 4, propriedade_id: 3, data_visita: '2026-11-01T12:00:00Z', data_proximo_contato: '2026-11-20' }),
      v({ id: 5, vendedor_id: 5, propriedade_id: 3, data_visita: '2026-08-01T12:00:00Z', data_proximo_contato: '2026-08-10' }), // muito antigo
    ], nome, '2026-11-26');
    expect(r).toEqual([{ vendedorId: 28, chave: 'manha:28:2026-11-26', titulo: 'Hoje: 1 retorno combinado', corpo: 'Sítio A · 1 atrasado', link: '/notificacoes' }]);
  });

  it('tarde conta só as de hoje sem retorno', () => {
    const r = avisosTarde([
      v({ id: 10, propriedade_id: 1, proximos_passos: 'Sem retorno: ,' }),
      v({ id: 11, propriedade_id: 2, data_visita: '2026-11-26T11:00:00Z' }),
      v({ id: 12, propriedade_id: 3, data_proximo_contato: '2026-12-01' }),
      v({ id: 13, propriedade_id: 3, proximos_passos: 'Sem retorno: comprou de outro' }),
      v({ id: 14, propriedade_id: 3, data_visita: '2026-11-25T12:00:00Z' }),
    ], nome, '2026-11-26');
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe('2 visitas de hoje sem próximo contato');
    expect(r[0].corpo).toMatch(/^Fazenda B e Sítio A/);
    expect(r[0].link).toBe('/completar-visita/11');
  });
});
