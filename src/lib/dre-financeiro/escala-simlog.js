// =============================================================================
// Escala "simlog" para graficos de MARGEM (%) do DRE Financeiro.
//
// O intervalo principal de leitura e LINEAR entre LIN_MIN..LIN_MAX (-10%..+15%,
// onde vive a operacao normal). Fora dele o eixo vira LOGARITMICO (comprimido),
// para que pontos extremos (ex.: margem -300% de uma familia com receita
// minuscula) continuem visiveis SEM achatar as linhas da zona util.
//
// Chart.js nao tem escala symlog nativa (a 'logarithmic' nao aceita negativos),
// entao a tecnica e: transformar os VALORES com simlogY() antes de plotar num
// eixo linear, posicionar ticks "bonitos" ja transformados (afterBuildTicks) e
// rotular/tooltipar sempre com o valor REAL (guardado em dataset.rawData).
//
// Uso tipico:
//   data: serie.map(simlogY), rawData: serie          // no dataset
//   scales: { y: yScaleSimlog(todosOsValores, {...}) }
//   tooltip: label usa item.dataset.rawData[item.dataIndex]
// =============================================================================

export const LIN_MIN = -10
export const LIN_MAX = 15

// Fora da zona linear: cada decada (x10) de excesso ocupa DECADA unidades do
// eixo; BASE calibra o "arranque" (os primeiros p.p. fora quase nao comprimem).
const BASE = 5
const DECADA = 10

// Valor real (%) -> posicao no eixo. Preserva null/undefined/NaN (Chart.js
// trata como buraco na linha).
export function simlogY(v) {
  if (v === null || v === undefined || !isFinite(v)) return v
  if (v >= LIN_MIN && v <= LIN_MAX) return v
  if (v > LIN_MAX) return LIN_MAX + Math.log10(1 + (v - LIN_MAX) / BASE) * DECADA
  return LIN_MIN - Math.log10(1 + (LIN_MIN - v) / BASE) * DECADA
}

// Posicao no eixo -> valor real (%) (inversa de simlogY, p/ rotular ticks).
export function simlogInv(t) {
  if (t === null || t === undefined || !isFinite(t)) return t
  if (t >= LIN_MIN && t <= LIN_MAX) return t
  if (t > LIN_MAX) return LIN_MAX + (Math.pow(10, (t - LIN_MAX) / DECADA) - 1) * BASE
  return LIN_MIN - (Math.pow(10, (LIN_MIN - t) / DECADA) - 1) * BASE
}

// Ticks "bonitos" da zona comprimida (em %, espelhados p/ negativo).
const NICE = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]

// Calcula min/max do eixo e a lista de ticks REAIS a partir dos dados.
// A zona linear (-10..15) aparece sempre inteira; a zona log so cresce ate
// cobrir o dado mais extremo.
export function escalaSimlog(valores) {
  const vals = []
  ;(valores || []).forEach((v) => { if (v !== null && v !== undefined && isFinite(v)) vals.push(v) })
  const dMin = vals.length ? Math.min.apply(null, vals) : 0
  const dMax = vals.length ? Math.max.apply(null, vals) : 0
  const ticksReais = [LIN_MIN, -5, 0, 5, 10, LIN_MAX]
  let topo = LIN_MAX
  let piso = LIN_MIN
  if (dMax > LIN_MAX) {
    for (const n of NICE) { ticksReais.push(n); topo = n; if (n >= dMax) break }
    if (topo < dMax) topo = dMax // dado alem do ultimo NICE: nao clipar
  }
  if (dMin < LIN_MIN) {
    for (const n of NICE) { ticksReais.push(-n); piso = -n; if (-n <= dMin) break }
    if (piso > dMin) piso = dMin
  }
  ticksReais.sort((a, b) => a - b)
  return { min: simlogY(piso), max: simlogY(topo), ticksReais }
}

// Monta o objeto de configuracao do eixo Y do Chart.js. `extra` e espalhado
// por cima (position, title, etc).
export function yScaleSimlog(valores, extra) {
  const e = escalaSimlog(valores)
  const posicoes = e.ticksReais.map((t) => ({ value: simlogY(t), label: Math.round(t) + '%' }))
  return Object.assign({
    type: 'linear',
    min: e.min,
    max: e.max,
    afterBuildTicks(axis) { axis.ticks = posicoes.map((p) => ({ value: p.value })) },
    ticks: {
      autoSkip: false,
      callback(v) {
        const p = posicoes.find((x) => Math.abs(x.value - v) < 1e-6)
        return p ? p.label : Math.round(simlogInv(v)) + '%'
      },
    },
    grid: { color(c) { return Math.abs(c.tick.value) < 1e-9 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' } },
  }, extra || {})
}
