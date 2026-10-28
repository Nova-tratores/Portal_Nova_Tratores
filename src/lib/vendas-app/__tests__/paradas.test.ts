// Paradas longas a explicar: 30 min+, sem visita registrada perto.
import { describe, it, expect } from 'vitest';
import { paradasAExplicar, temVisitaPerto, motivoValido } from '../paradas';

const parada = (inicio: string, dur: number, lat = -23.2, lng = -49.3) => ({
  lat, lng, inicio, fim: new Date(new Date(inicio).getTime() + dur * 60000).toISOString(), duracao_min: dur,
});

describe('paradas a explicar', () => {
  it('curta não pede; longa sem visita pede; longa com visita perto não pede', () => {
    const curta = parada('2026-10-22T12:00:00Z', 20);
    const almoco = parada('2026-10-22T15:00:00Z', 70);
    const cliente = parada('2026-10-22T17:00:00Z', 45, -23.25, -49.35);
    const visitas = [{ latitude: -23.2503, longitude: -49.3502, data_visita: '2026-10-22T17:20:00Z' }];
    expect(paradasAExplicar([curta, almoco, cliente], visitas)).toEqual([almoco]);
  });
  it('visita longe ou fora da hora não cobre a parada', () => {
    const p = parada('2026-10-22T17:00:00Z', 45);
    expect(temVisitaPerto(p, [{ latitude: -23.21, longitude: -49.3, data_visita: '2026-10-22T17:20:00Z' }])).toBe(false); // ~1,1 km
    expect(temVisitaPerto(p, [{ latitude: -23.2, longitude: -49.3, data_visita: '2026-10-22T20:00:00Z' }])).toBe(false);
  });
  it('só aceita os motivos da lista', () => {
    expect(motivoValido('almoco')).toBe(true);
    expect(motivoValido('cochilo')).toBe(false);
  });
});
