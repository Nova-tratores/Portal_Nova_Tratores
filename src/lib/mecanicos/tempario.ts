// Tempário Mahindra v1 (José, 20/10/2026: "tem basicamente tudo nele e o tempo") — PURO.
// 1.170 atividades tiradas do PDF "Tempario Versão 1 - MAHINDRA" (1.047 com tempo; as "Não" ficam sem tempo).
// Daqui sai a PREVISÃO de horas de uma OS: o que o técnico escreveu que fez → atividades do tempário → minutos.
import TABELA from './dados/tempario-mahindra-v1.json'

export interface AtividadeTempario { codigo: string | null; acao: string | null; sistema: string | null; subsistema: string | null; atividade: string; minutos: number | null }
export const TEMPARIO: (AtividadeTempario & { i: number })[] = (TABELA as AtividadeTempario[]).map((x, i) => ({ ...x, i }))

const SINONIMOS: [RegExp, string][] = [
  [/\b(troca|trocad[oa]s?|trocar|trocamos|substitu\w*)\b/g, 'substituicao'],
  [/\b(remov\w*|retir\w*|sacad\w*|sacar)\b/g, 'remocao'],
  [/\b(repar\w*|consert\w*|arrum\w*)\b/g, 'reparo'],
  [/\b(instal\w*|coloc\w*|montad\w*)\b/g, 'instalacao'],
  [/\b(regul\w*)\b/g, 'regulagem'],
  [/\b(limp\w*|lavag\w*|lavad\w*)\b/g, 'limpeza'],
  [/\b(diagnost\w*|analis\w*|verific\w*|avali\w*)\b/g, 'diagnostico'],
  [/\b(hidraul\w*)\b/g, 'hidraulico'], [/\b(eletric\w*|eletronic\w*)\b/g, 'eletrico'],
  [/\b(embreag\w*)\b/g, 'embreagem'], [/\b(cambio|caixa de marcha\w*)\b/g, 'cambio'],
  [/\b(oleo|óleo)\b/g, 'oleo'], [/\b(retentor\w*)\b/g, 'retentor'], [/\b(rolamento\w*)\b/g, 'rolamento'],
  [/\b(bico\w*)\b/g, 'bico'], [/\b(pneu\w*)\b/g, 'pneu'], [/\b(radiador\w*)\b/g, 'radiador'],
]
const VAZIAS = new Set(['para', 'com', 'sem', 'dos', 'das', 'que', 'foi', 'feito', 'feita', 'realizado', 'realizada', 'servico', 'trator', 'cliente', 'mais', 'uma', 'umas', 'uns', 'nos', 'nas', 'pelo', 'pela', 'onde', 'tambem', 'apos', 'ser', 'estava', 'esta', 'tava', 'por', 'ate', 'entre'])

export function normalizar(t: string): string {
  let s = String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
  for (const [re, v] of SINONIMOS) s = s.replace(re, v)
  return s.replace(/\s+/g, ' ').trim()
}
const tokens = (t: string) => normalizar(t).split(' ').filter((w) => w.length >= 3 && !VAZIAS.has(w))

// índice: tokens de cada atividade + raridade (palavra rara vale mais)
const TOK = TEMPARIO.map((a) => new Set(tokens(`${a.atividade} ${a.sistema || ''} ${a.subsistema || ''}`)))
const DF = new Map<string, number>()
for (const s of TOK) for (const w of s) DF.set(w, (DF.get(w) || 0) + 1)
const idf = (w: string) => Math.log(1 + TEMPARIO.length / (1 + (DF.get(w) || 0)))

/** As atividades do tempário mais parecidas com o texto (para a IA escolher entre poucas). Só as que têm tempo. */
export function candidatos(texto: string, n = 60): (AtividadeTempario & { i: number; nota: number })[] {
  const q = [...new Set(tokens(texto))]
  if (!q.length) return []
  return TEMPARIO.map((a, k) => {
    if (!a.minutos) return null
    let nota = 0
    for (const w of q) if (TOK[k].has(w)) nota += idf(w)
    return nota > 0 ? { ...a, nota } : null
  }).filter((x): x is AtividadeTempario & { i: number; nota: number } => !!x).sort((a, b) => b.nota - a.nota).slice(0, n)
}

export const fmtMin = (m: number) => { const h = Math.floor(m / 60), mm = Math.round(m % 60); return h ? `${h}h${mm ? String(mm).padStart(2, '0') : ''}` : `${mm}min` }

/** Compara as horas apontadas com a previsão do tempário.
 *  muito acima (> 1,5× e +1h) · acima (> 1,25×) · ok · rápido demais (menos da metade e −1h). Normal = de 50% a 100% do tempário (José, 20/10/2026: o tempário é generoso): pode ter faltado etapa → risco de retrabalho. */
export type SituacaoPrevisao = 'muito_acima' | 'acima' | 'ok' | 'rapido' | 'sem_previsao'
export function compararPrevisao(horasApontadas: number, minutosPrevistos: number | null): { situacao: SituacaoPrevisao; diffHoras: number; razao: number | null } {
  if (!minutosPrevistos || minutosPrevistos <= 0) return { situacao: 'sem_previsao', diffHoras: 0, razao: null }
  const prev = minutosPrevistos / 60
  const diff = Math.round((horasApontadas - prev) * 100) / 100
  const razao = horasApontadas / prev
  const situacao: SituacaoPrevisao = razao > 1.5 && diff >= 1 ? 'muito_acima' : razao > 1.25 && diff >= 0.5 ? 'acima' : razao < 0.5 && diff <= -1 ? 'rapido' : 'ok'
  return { situacao, diffHoras: diff, razao: Math.round(razao * 100) / 100 }
}
