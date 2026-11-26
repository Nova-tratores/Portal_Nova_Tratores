// ESTIMATIVA DE TEMPO (24/11/2026) — regras PURAS (testadas em __tests__/estimativa.test.ts).
// José: "tenho dificuldade de dar tempos para os trabalhos... queria algo manual e automático".
//  · Manual fácil: um TAMANHO (Rápido · Pequeno · Médio · Grande · Enorme) ou as horas digitadas.
//  · Automático: sugere pelo histórico — tickets PARECIDOS que a pessoa já terminou (mesmo quadro,
//    mesma categoria, palavras do título). Usa o tempo REAL (Modo Agora) quando existe; senão, o
//    que tinha sido estimado. Com tempo real e estimado juntos, aprende o "fator" da pessoa
//    (ex.: costuma levar 1,4× o que estima).
// O plano grava como hoje: payload.dias × payload.horas_dia (a Fila e o Cronograma já leem isso).

export interface Tamanho { id: '15min' | '1h' | 'meio' | 'dia' | '3dias'; rotulo: string; horas: number; dica: string }

/** Chips de 1 clique (melhorias 2.1): o "dia" é o da fila, 4,5 h (lib/trabalho/capacidade.ts). */
export const TAMANHOS: Tamanho[] = [
  { id: '15min', rotulo: '15 min', horas: 0.25, dica: 'coisa rápida' },
  { id: '1h', rotulo: '1 h', horas: 1, dica: 'uma hora' },
  { id: 'meio', rotulo: '½ dia', horas: 2.25, dica: 'meio dia de fila' },
  { id: 'dia', rotulo: '1 dia', horas: 4.5, dica: 'um dia de fila' },
  { id: '3dias', rotulo: '3 dias', horas: 13.5, dica: 'três dias de fila' },
]

/** Tamanho mais perto de um total de horas. */
export function tamanhoDe(horas: number): Tamanho {
  return TAMANHOS.reduce((m, t) => (Math.abs(Math.log(t.horas / horas)) < Math.abs(Math.log(m.horas / horas)) ? t : m), TAMANHOS[0])
}

/** Total de horas → como a fila guarda (dias × horas por dia), sem passar da capacidade do dia. */
export function planoDeHoras(horas: number, capacidade: number): { dias: number; horasDia: number } {
  const h = Math.max(0.25, horas)
  const dias = Math.max(1, Math.ceil(h / capacidade - 1e-9))
  // de 15 em 15 min (o servidor grava horas_dia com passo de 0,25)
  return { dias, horasDia: Math.round((h / dias) * 4) / 4 || 0.25 }
}

/**
 * Horas ÚTEIS entre dois instantes (ISO): só seg–sex, 07:30–17:30 de Brasília (fuso fixo -03:00).
 * Serve para medir quanto um pedido levou entre "começou" e "resolveu" pelos eventos.
 */
export function horasUteisEntre(inicioIso: string, fimIso: string): number {
  const a = Date.parse(inicioIso), b = Date.parse(fimIso)
  if (!(b > a)) return 0
  const H = 3600000
  let total = 0
  // dia (em Brasília) do início até o do fim
  const diaDe = (ms: number) => new Date(ms - 3 * H).toISOString().slice(0, 10)
  for (let d = diaDe(a), i = 0; d <= diaDe(b) && i < 400; i++) {
    const w = new Date(d + 'T12:00:00Z').getUTCDay()
    if (w !== 0 && w !== 6) {
      const abre = Date.parse(d + 'T07:30:00-03:00'), fecha = Date.parse(d + 'T17:30:00-03:00')
      total += Math.max(0, Math.min(b, fecha) - Math.max(a, abre))
    }
    const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10)
  }
  return total / H
}

// ------------------------------------------------------------- sugestão automática
export interface Feito {
  titulo: string; categoria?: string | null; quadro_id?: string | null
  /** dias × horas_dia que tinha sido estimado (null = ninguém estimou) */
  estimado: number | null
  /** horas medidas no Modo Agora (null = não mediu) */
  real: number | null
}
export interface Alvo { titulo: string; categoria?: string | null; quadro_id?: string | null }
export interface Sugestao { horas: number; tamanho: Tamanho; base: number; motivo: string; fator: number | null }

const PARADAS = new Set(['para', 'pelo', 'pela', 'como', 'mais', 'sobre', 'entre', 'fazer', 'ticket', 'sistema', 'novo', 'nova', 'portal', 'esta', 'esse', 'essa', 'isso', 'cliente'])
/** Palavras que contam para "parecido" (sem acento, ≥ 4 letras, sem as comuns demais). */
export function palavras(s: string): Set<string> {
  return new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PARADAS.has(w)))
}

/** 0 a 1: o quanto um ticket feito se parece com o novo. */
export function parecido(a: Alvo, f: Feito): number {
  const pa = palavras(a.titulo), pf = palavras(f.titulo)
  let comum = 0
  for (const w of pa) if (pf.has(w)) comum++
  const texto = pa.size && pf.size ? comum / Math.min(pa.size, pf.size) : 0
  return Math.min(1, texto * 0.6 + (a.quadro_id && a.quadro_id === f.quadro_id ? 0.25 : 0) + (a.categoria && a.categoria === f.categoria ? 0.15 : 0))
}

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/**
 * Sugere as horas de um trabalho novo pelo histórico da pessoa. null = sem base nenhuma
 * (a tela mostra os tamanhos sem sugestão: "ainda não tenho histórico").
 */
export function sugerirHoras(alvo: Alvo, feitos: Feito[]): Sugestao | null {
  const comHoras = feitos.filter((f) => (f.real ?? f.estimado ?? 0) > 0)
  if (!comHoras.length) return null
  // Fator pessoal: real ÷ estimado, quando os dois existem (pelo menos 3 casos).
  const pares = comHoras.filter((f) => f.real && f.estimado).map((f) => f.real! / f.estimado!)
  const fator = pares.length >= 3 ? Math.min(3, Math.max(0.5, mediana(pares))) : null
  const horasDe = (f: Feito) => f.real ?? f.estimado! * (fator ?? 1)
  const notas = comHoras.map((f) => ({ f, n: parecido(alvo, f) })).filter((x) => x.n >= 0.25).sort((a, b) => b.n - a.n).slice(0, 7)
  const usados = notas.length >= 2 ? notas.map((x) => x.f) : comHoras
  const horas = Math.max(0.5, Math.round(mediana(usados.map(horasDe)) * 2) / 2)
  const motivo = notas.length >= 2
    ? `${usados.length} trabalhos parecidos levaram ~${String(horas).replace('.', ',')} h`
    : `na média, seus trabalhos levam ~${String(horas).replace('.', ',')} h`
  return { horas, tamanho: tamanhoDe(horas), base: usados.length, motivo: fator && Math.abs(fator - 1) >= 0.15 ? `${motivo} (você costuma levar ${String(Math.round(fator * 10) / 10).replace('.', ',')}× o que estima)` : motivo, fator }
}
