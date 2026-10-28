// Localização do cliente pelo GPS do carro do técnico (José, 22/10/2026) — regras puras.
// Nos dias de execução da OS, o carro do técnico (Frota → tecnico_veiculos) parou ≥ 30 min fora da loja:
// essas paradas são as candidatas a "onde fica o cliente". O usuário escolhe e confirma para o CPF/CNPJ.
// Testes em __tests__/localizacao-cliente.test.ts.

export const PARADA_MIN_MINUTOS = 30;
/** pino oficial da loja de Piraju (o mesmo do deslocamento do Tratorilson) */
export const LOJA = { lat: -23.2085475, lng: -49.3709057 };
/** parada a menos disso da loja é a própria loja */
export const RAIO_LOJA_M = 400;

export interface ParadaGPS {
  placa: string;
  tecnico: string;          // dono do carro (ou "carro de Fulano")
  data: string;             // YYYY-MM-DD
  inicio: string;           // ISO
  fim: string | null;
  duracaoMin: number;
  lat: number;
  lng: number;
  classe?: string | null;   // classificação da Frota (loja, cliente, fora_geocerca…)
  local?: string | null;    // nome do destino conhecido, se houver
  acompanhado?: boolean;    // técnico da OS sem carro: parada do carro de outro técnico
  /** minutos da parada dentro do expediente (07h–19h de Brasília) — pernoite em hotel não conta */
  noExpediente?: number;
}

export const EXPEDIENTE = { ini: 7, fim: 19 };

/** minutos da parada entre 07h e 19h (Brasília, UTC−3), somando cada dia que ela atravessa */
export function minutosNoExpediente(inicio: string, fim: string | null, duracaoMin: number): number {
  const a = Date.parse(inicio);
  if (!Number.isFinite(a)) return 0;
  const b = fim && Number.isFinite(Date.parse(fim)) ? Date.parse(fim) : a + duracaoMin * 60_000;
  const H = 3_600_000, dia0 = Math.floor((a - 3 * H) / (24 * H));
  let total = 0;
  for (let d = dia0; d * 24 * H + 3 * H <= b; d++) {
    const base = d * 24 * H + 3 * H; // 00h de Brasília
    const i = Math.max(a, base + EXPEDIENTE.ini * H), e = Math.min(b, base + EXPEDIENTE.fim * H);
    if (e > i) total += (e - i) / 60_000;
  }
  return Math.round(total);
}

export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** distância em metros (haversine) */
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Dias de execução da OS: lista "YYYY-MM-DD[ HH:MM-HH:MM]" separada por vírgula (Dias_Execucao),
 * os dias do relatório do técnico e, sem nada disso, a previsão de execução. Sem repetir, em ordem.
 */
export function diasDaOS(diasExecucao: string | null | undefined, diasRelatorio: string[], previsaoExecucao?: string | null): string[] {
  const set = new Set<string>();
  for (const parte of String(diasExecucao || '').split(',')) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(parte);
    if (m) set.add(m[1]);
  }
  for (const d of diasRelatorio) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
  if (!set.size) { const m = /(\d{4}-\d{2}-\d{2})/.exec(String(previsaoExecucao || '')); if (m) set.add(m[1]); }
  return [...set].sort();
}

/** paradas candidatas: ≥ 30 min DENTRO do expediente, fora da loja (classe da Frota ou distância), mais longas primeiro */
export function paradasCandidatas(paradas: ParadaGPS[]): ParadaGPS[] {
  const vistas = new Set<string>();
  return paradas
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0))
    .map((p) => ({ ...p, noExpediente: minutosNoExpediente(p.inicio, p.fim, p.duracaoMin) }))
    .filter((p) => p.duracaoMin >= PARADA_MIN_MINUTOS && p.noExpediente >= PARADA_MIN_MINUTOS)
    .filter((p) => p.classe !== 'loja' && distanciaM(p, LOJA) > RAIO_LOJA_M)
    .filter((p) => { const k = `${p.placa}|${p.inicio}`; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .sort((a, b) => Number(!!a.acompanhado) - Number(!!b.acompanhado) || b.noExpediente - a.noExpediente);
}

export function coordenadaValida(lat: unknown, lng: unknown): boolean {
  const a = Number(lat), b = Number(lng);
  // Brasil, com folga
  return Number.isFinite(a) && Number.isFinite(b) && a < 6 && a > -34 && b < -28 && b > -75;
}

export const duracaoTexto = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`);
