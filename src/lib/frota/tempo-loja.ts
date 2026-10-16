// Tempo de viagem loja ↔ qualquer ponto, a partir do HISTÓRICO real da frota
// (puro — testado em __tests__/tempo-loja.test.ts).
//
// Uma "viagem" sai das paradas já classificadas (frota_paradas, fechar-dia):
//   IDA   = saiu da loja (fim de uma parada 'loja') → chegou na parada seguinte
//   VOLTA = saiu de uma parada fora da loja → chegou na parada seguinte, na loja
// Para estimar um ponto: viagens com destino (ida) / origem (volta) perto dele,
// sem as fora da curva (quartis), e a MEDIANA. Sem viagens por perto, estima
// pela distância em linha reta com o modelo da frota (fixo + min por km reto).

export interface ParadaHist {
  placa: string;
  inicio: string;        // ISO
  fim: string | null;    // ISO
  latitude: number;
  longitude: number;
  classe: string | null; // 'loja' | 'cliente_portal' | 'fora_geocerca' | ...
}

export interface Viagem {
  sentido: 'ida' | 'volta';
  lat: number;     // o ponto fora da loja (destino da ida / origem da volta)
  lng: number;
  min: number;     // duração em minutos
  kmReto: number;  // distância em linha reta loja ↔ ponto (só para filtrar)
  placa?: string;
  saida?: string;  // ISO: fim da parada de origem
  chegada?: string; // ISO: início da parada de destino
}

export interface Estimativa {
  min: number | null;
  viagens: number;           // usadas depois de tirar as fora da curva
  descartadas: number;
  fonte: 'historico' | 'distancia' | 'sem_dados';
}

/** Viagem mais longa que isso não é deslocamento (carro ficou no caminho). */
export const VIAGEM_MAX_MIN = 6 * 60;
/** Na loja ou a menos disso dela, não é viagem. */
export const KM_MIN_VIAGEM = 1;
/** Velocidade média em linha reta acima disso é erro de GPS. */
export const KMH_RETO_MAX = 110;

export function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const minutosEntre = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

/** Monta as viagens de ida e volta a partir das paradas (em qualquer ordem). */
export function extrairViagens(paradas: ParadaHist[], loja: { lat: number; lng: number }): Viagem[] {
  const porPlaca = new Map<string, ParadaHist[]>();
  for (const p of paradas) {
    if (!p.placa || !p.inicio || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const arr = porPlaca.get(p.placa) || [];
    arr.push(p);
    porPlaca.set(p.placa, arr);
  }
  const out: Viagem[] = [];
  for (const lista of porPlaca.values()) {
    lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
    for (let i = 1; i < lista.length; i++) {
      const a = lista[i - 1], b = lista[i];
      if (!a.fim) continue;
      const aLoja = a.classe === 'loja', bLoja = b.classe === 'loja';
      if (aLoja === bLoja) continue; // loja→loja ou fora→fora não é ida/volta
      const min = minutosEntre(a.fim, b.inicio);
      if (!(min > 0) || min > VIAGEM_MAX_MIN) continue;
      const fora = aLoja ? b : a;
      const kmReto = distKm(loja.lat, loja.lng, fora.latitude, fora.longitude);
      if (kmReto < KM_MIN_VIAGEM) continue;
      if (kmReto / (min / 60) > KMH_RETO_MAX) continue;
      out.push({ sentido: aLoja ? 'ida' : 'volta', lat: fora.latitude, lng: fora.longitude, min, kmReto, placa: a.placa, saida: a.fim, chegada: b.inicio });
    }
  }
  return out;
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function quartil(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Tira as fora da curva (fora de Q1−1,5·IQR … Q3+1,5·IQR). Com menos de 4 valores, mantém todos. */
export function semForaDaCurva(xs: number[]): number[] {
  if (xs.length < 4) return xs;
  const s = [...xs].sort((a, b) => a - b);
  const q1 = quartil(s, 0.25), q3 = quartil(s, 0.75), iqr = q3 - q1;
  return s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
}

/** Modelo da frota: minutos = fixo + porKm x km em linha reta. Ajustado por
 *  mínimos quadrados nas viagens limpas (>= 3 km, sem as fora da curva em min/km).
 *  O fixo absorve sair da cidade/manobra; sem ele, viagem longa saía estimada
 *  pelo ritmo de viagem curta (Bauru dava 3h27). */
export interface ModeloDistancia { fixo: number; porKm: number }

export function modeloDistancia(viagens: Viagem[]): ModeloDistancia | null {
  const base = viagens.filter((v) => v.kmReto >= 3);
  if (base.length < 5) return null;
  const ritmos = semForaDaCurva(base.map((v) => v.min / v.kmReto));
  const lo = Math.min(...ritmos), hi = Math.max(...ritmos);
  const limpas = base.filter((v) => v.min / v.kmReto >= lo && v.min / v.kmReto <= hi);
  const n = limpas.length;
  const mx = limpas.reduce((acc, v) => acc + v.kmReto, 0) / n;
  const my = limpas.reduce((acc, v) => acc + v.min, 0) / n;
  const sxx = limpas.reduce((acc, v) => acc + (v.kmReto - mx) ** 2, 0);
  const sxy = limpas.reduce((acc, v) => acc + (v.kmReto - mx) * (v.min - my), 0);
  const porKm = sxx > 0 ? sxy / sxx : 0;
  if (!(porKm > 0)) return { fixo: 0, porKm: mediana(ritmos) };
  return { fixo: Math.max(0, my - porKm * mx), porKm };
}

export const esperadoMin = (m: ModeloDistancia, km: number) => m.fixo + m.porKm * km;

/** Viagem que levou mais de 2,5x (ou menos de 0,4x) o esperado para a distância
 *  é fora da curva: parou no caminho sem registrar parada, ou GPS errado.
 *  Vale mesmo com poucas viagens (onde os quartis não decidem nada). */
export const FOLGA_MAX = 2.5;
export const FOLGA_MIN = 0.4;

/** As viagens perto do ponto que valem (sem as fora da curva), ou null. */
export function selecionarViagens(
  ponto: { lat: number; lng: number },
  viagens: Viagem[],
  sentido: 'ida' | 'volta',
  modelo: ModeloDistancia | null,
): { perto: Viagem[]; limpas: Viagem[] } | null {
  const doSentido = viagens.filter((v) => v.sentido === sentido);
  for (const raio of [2, 5]) {
    const perto = doSentido.filter((v) => distKm(v.lat, v.lng, ponto.lat, ponto.lng) <= raio);
    if (perto.length < (raio === 2 ? 3 : 2)) continue;
    // 1º plausibilidade pela distância (funciona com poucas viagens), 2º quartis
    const plausiveis = modelo
      ? perto.filter((v) => {
          const esp = esperadoMin(modelo, v.kmReto);
          return v.min <= esp * FOLGA_MAX && v.min >= esp * FOLGA_MIN;
        })
      : perto;
    if (!plausiveis.length) continue;
    const mins = semForaDaCurva(plausiveis.map((v) => v.min));
    const lo = mins[0], hi = mins[mins.length - 1];
    return { perto, limpas: plausiveis.filter((v) => v.min >= lo && v.min <= hi) };
  }
  return null;
}

export function estimar(
  ponto: { lat: number; lng: number },
  loja: { lat: number; lng: number },
  viagens: Viagem[],
  sentido: 'ida' | 'volta',
  modelo: ModeloDistancia | null,
): Estimativa {
  const sel = selecionarViagens(ponto, viagens, sentido, modelo);
  if (sel) {
    const limpas = sel.limpas.map((v) => v.min);
    return { min: Math.round(mediana(limpas)), viagens: limpas.length, descartadas: sel.perto.length - limpas.length, fonte: 'historico' };
  }
  if (modelo) {
    const km = distKm(loja.lat, loja.lng, ponto.lat, ponto.lng);
    return { min: Math.round(esperadoMin(modelo, km)), viagens: 0, descartadas: 0, fonte: 'distancia' };
  }
  return { min: null, viagens: 0, descartadas: 0, fonte: 'sem_dados' };
}

// ── km REALIZADO de uma viagem, pelos pontos do rastreador (rotas_vendedor) ──
export interface PontoRota { dt: string; lat: number; lng: number; vel?: number | null }

/** Lacuna máxima entre a saída/chegada e o 1º/último ponto da janela. */
export const LACUNA_MAX_MIN = 15;

/** Km rodados entre `de` e `ate`: soma só os trechos com o carro andando
 *  (velocidade > 0 em uma das pontas — parado, o GPS "passeia" e quase dobrava
 *  o km) e ignora saltos de 5 km ou mais (erro de GPS). Mesma conta do km do
 *  dia em lib/pos/rastreamento. null quando os pontos não cobrem a viagem. */
export function kmNoTrecho(pontos: PontoRota[], de: string, ate: string): number | null {
  const ini = new Date(de).getTime(), fim = new Date(ate).getTime();
  const janela = pontos
    .filter((p) => { const t = new Date(p.dt).getTime(); return t >= ini && t <= fim && Number.isFinite(p.lat) && Number.isFinite(p.lng); })
    .sort((a, b) => a.dt.localeCompare(b.dt));
  if (janela.length < 2) return null;
  const lacuna = LACUNA_MAX_MIN * 60_000;
  if (new Date(janela[0].dt).getTime() - ini > lacuna || fim - new Date(janela[janela.length - 1].dt).getTime() > lacuna) return null;
  let km = 0;
  for (let i = 1; i < janela.length; i++) {
    const a = janela[i - 1], b = janela[i];
    if (!((Number(a.vel) || 0) > 0 || (Number(b.vel) || 0) > 0)) continue;
    const d = distKm(a.lat, a.lng, b.lat, b.lng);
    if (d < 5) km += d;
  }
  return km;
}

/** Mediana dos km realizados (ignora as viagens sem pontos), com 1 casa. */
export function kmRealizado(kms: (number | null)[]): { km: number | null; viagens: number } {
  const ok = kms.filter((k): k is number => k != null && k > 0);
  if (!ok.length) return { km: null, viagens: 0 };
  return { km: Math.round(mediana(ok) * 10) / 10, viagens: ok.length };
}

/** "42 min" · "1h05" */
export function fmtMin(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
