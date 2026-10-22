// Paradas longas do carro do vendedor: quais precisam de explicação.
// Regra (decisão do usuário 22/10/2026): parada de 30 min ou mais, sem visita
// registrada a até 500 m entre 30 min antes e 30 min depois, vira "a explicar".
// Nada vira visita sozinho — o vendedor diz o que foi.

export const MOTIVOS_PARADA = [
  { key: 'visita', label: 'Visita', icone: '🤝' },
  { key: 'almoco', label: 'Almoço', icone: '🍽️' },
  { key: 'oficina', label: 'Oficina', icone: '🔧' },
  { key: 'abastecimento', label: 'Abastecimento', icone: '⛽' },
  { key: 'pessoal', label: 'Pessoal', icone: '🏠' },
  { key: 'outro', label: 'Outro', icone: '📝' },
] as const;
export type MotivoParada = (typeof MOTIVOS_PARADA)[number]['key'];
export const motivoValido = (m: unknown): m is MotivoParada => MOTIVOS_PARADA.some((x) => x.key === m);

export const PARADA_LONGA_MIN = 30;
const RAIO_M = 500;
const FOLGA_MIN = 30;

const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export interface ParadaLonga { lat: number; lng: number; inicio: string; fim: string | null; duracao_min: number; local?: string | null }
export interface VisitaPonto { latitude: number | null; longitude: number | null; data_visita: string }

/** A parada tem visita registrada perto (lugar e hora)? */
export function temVisitaPerto(p: ParadaLonga, visitas: VisitaPonto[]): boolean {
  const ini = new Date(p.inicio).getTime() - FOLGA_MIN * 60000;
  const fim = new Date(p.fim || p.inicio).getTime() + FOLGA_MIN * 60000;
  return visitas.some((v) => {
    if (v.latitude == null || v.longitude == null) return false;
    const t = new Date(v.data_visita).getTime();
    return t >= ini && t <= fim && distM(p, { lat: Number(v.latitude), lng: Number(v.longitude) }) <= RAIO_M;
  });
}

/** Paradas longas que precisam de explicação (sem visita perto). */
export function paradasAExplicar<T extends ParadaLonga>(paradas: T[], visitas: VisitaPonto[]): T[] {
  return paradas.filter((p) => p.duracao_min >= PARADA_LONGA_MIN && !temVisitaPerto(p, visitas));
}
