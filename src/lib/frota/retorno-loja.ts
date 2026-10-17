// Carro voltando para a loja: detecta e estima a hora de chegada (puro —
// testado em __tests__/retorno-loja.test.ts).
//
// Sinais usados, todos dos pontos do rastreador do DIA:
//   1. andando agora e se APROXIMANDO da loja (mais perto do que há 3 e 10 min);
//   2. MESMO CAMINHO DA IDA: se a posição atual cai em cima do trajeto que o
//      carro fez ao sair da loja hoje, o que falta é o km desse trajeto (a
//      estrada de verdade, não a linha reta);
//   3. senão, linha reta × a sinuosidade da ida de hoje (padrão 1,3);
//   4. velocidade: média do dia andando misturada com a dos últimos 20 min.

export interface PontoDia { dt: string; lat: number; lng: number; vel: number }

export interface Retorno {
  eta: string;            // ISO
  min: number;            // minutos até chegar
  kmRestante: number;
  kmh: number;            // velocidade usada
  mesmoCaminho: boolean;  // está refazendo o caminho da ida
  confianca: 'alta' | 'media';
}

export const RAIO_LOJA_KM = 0.8;
/** Precisa ter chegado mais perto da loja pelo menos isso nos últimos 10 min. */
export const APROX_MIN_KM = 0.5;
/** Distância máxima do trajeto da ida para contar como "mesmo caminho". */
export const MESMO_CAMINHO_M = 300;
export const SINUOSIDADE_PADRAO = 1.3;
/** Fora do caminho da ida: parte do deslocamento (20 min) que precisa ser rumo à loja. */
export const DIRECAO_MIN = 0.7;
export const KMH_MIN = 20;
export const KMH_MAX = 100;

export function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ms = (s: string) => new Date(s).getTime();

/** Trecho andando entre dois pontos (mesma regra do km do dia: vel > 0 numa das
 *  pontas, sem salto de GPS de 5 km, sem buraco de mais de 10 min). */
function trecho(a: PontoDia, b: PontoDia): { km: number; h: number } | null {
  if (!((a.vel || 0) > 0 || (b.vel || 0) > 0)) return null;
  const dt = (ms(b.dt) - ms(a.dt)) / 3_600_000;
  if (!(dt > 0) || dt > 10 / 60) return null;
  const km = distKm(a.lat, a.lng, b.lat, b.lng);
  if (km >= 5) return null;
  return { km, h: dt };
}

/** Velocidade média andando (km/h) entre os índices; null se andou menos de 5 min. */
export function velocidadeMedia(pontos: PontoDia[], de = 0, ate = pontos.length - 1): number | null {
  let km = 0, h = 0;
  for (let i = Math.max(1, de + 1); i <= ate; i++) {
    const t = trecho(pontos[i - 1], pontos[i]);
    if (t) { km += t.km; h += t.h; }
  }
  return h >= 5 / 60 ? km / h : null;
}

function kmEntre(pontos: PontoDia[], de: number, ate: number): number {
  let km = 0;
  for (let i = de + 1; i <= ate; i++) { const t = trecho(pontos[i - 1], pontos[i]); if (t) km += t.km; }
  return km;
}

/** Índice do ponto mais próximo de `minAtras` minutos antes do último. */
function indiceAtras(pontos: PontoDia[], minAtras: number): number {
  const alvo = ms(pontos[pontos.length - 1].dt) - minAtras * 60_000;
  let i = pontos.length - 1;
  while (i > 0 && ms(pontos[i].dt) > alvo) i--;
  return i;
}

/**
 * Estima a volta para a loja. `pontos` = os do dia, em qualquer ordem.
 * Devolve null quando o carro não parece estar voltando.
 */
export function estimarRetorno(pontosDia: PontoDia[], loja: { lat: number; lng: number }): Retorno | null {
  const pontos = pontosDia
    .filter((p) => p.dt && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => ms(a.dt) - ms(b.dt));
  if (pontos.length < 5) return null;
  const n = pontos.length - 1;
  const atual = pontos[n];
  const d = (p: PontoDia) => distKm(p.lat, p.lng, loja.lat, loja.lng);
  const dAgora = d(atual);
  if (dAgora <= RAIO_LOJA_KM) return null;
  if ((atual.vel || 0) < 5) return null;

  // 1. aproximando: mais perto do que há 3 min e bem mais perto do que há 10 min
  const i3 = indiceAtras(pontos, 3), i10 = indiceAtras(pontos, 10);
  if (i10 === n || ms(atual.dt) - ms(pontos[i10].dt) < 6 * 60_000) return null; // histórico curto demais
  if (!(dAgora < d(pontos[i3])) || !(dAgora <= d(pontos[i10]) - APROX_MIN_KM)) return null;

  // 2. ida de hoje: da última vez na loja até 15 min atrás (o trecho recente é a própria volta)
  let saida = -1;
  for (let i = n; i >= 0; i--) if (d(pontos[i]) <= RAIO_LOJA_KM) { saida = i; break; }
  const fimIda = indiceAtras(pontos, 15);
  let mesmoCaminho = false;
  let kmRestante: number | null = null;
  let vIda: number | null = null;
  let sinuosidade = SINUOSIDADE_PADRAO;
  if (saida >= 0 && fimIda > saida) {
    // ponto da ida mais perto de onde o carro está agora (o 1º que passou perto = a ida)
    let melhor = -1, melhorD = Infinity;
    for (let i = saida; i <= fimIda; i++) {
      const dd = distKm(pontos[i].lat, pontos[i].lng, atual.lat, atual.lng) * 1000;
      if (dd < melhorD) { melhorD = dd; melhor = i; }
    }
    if (melhor > saida && melhorD <= MESMO_CAMINHO_M) {
      mesmoCaminho = true;
      kmRestante = kmEntre(pontos, saida, melhor) + melhorD / 1000;
      vIda = velocidadeMedia(pontos, saida, melhor);
    }
    // sinuosidade da ida: km rodado até o ponto mais longe ÷ linha reta até ele
    let longe = saida;
    for (let i = saida; i <= fimIda; i++) if (d(pontos[i]) > d(pontos[longe])) longe = i;
    const reto = d(pontos[longe]);
    if (reto >= 3) {
      const s = kmEntre(pontos, saida, longe) / reto;
      if (s >= 1.05 && s <= 2) sinuosidade = s;
    }
  }
  if (kmRestante == null) {
    // fora do caminho da ida, "aproximando" sozinho dá alarme falso (carro indo a
    // um cliente que fica na direção da loja): exige que a maior parte do
    // deslocamento dos últimos 20 min tenha sido NA DIREÇÃO da loja.
    const i20 = indiceAtras(pontos, 20);
    const desloc = distKm(pontos[i20].lat, pontos[i20].lng, atual.lat, atual.lng);
    if (desloc < 0.5 || (d(pontos[i20]) - dAgora) / desloc < DIRECAO_MIN) return null;
    kmRestante = dAgora * sinuosidade;
  }

  // 3. velocidade: no mesmo caminho, a que o carro fez NESSE trecho na ida
  //    (já inclui a parte lenta da cidade); senão a dos últimos 20 min e, sem
  //    ela, a média do dia andando. A média do dia pura saía ~27% mais lenta
  //    que a volta real (backtest set–out/2026).
  const vRecente = velocidadeMedia(pontos, indiceAtras(pontos, 20), n);
  const v = vIda ?? vRecente ?? velocidadeMedia(pontos);
  if (v == null) return null;
  const kmh = Math.min(KMH_MAX, Math.max(KMH_MIN, v));

  const min = Math.max(1, Math.round((kmRestante / kmh) * 60));
  return {
    eta: new Date(ms(atual.dt) + min * 60_000).toISOString(),
    min,
    kmRestante: Math.round(kmRestante * 10) / 10,
    kmh: Math.round(kmh),
    mesmoCaminho,
    confianca: mesmoCaminho ? 'alta' : 'media',
  };
}
