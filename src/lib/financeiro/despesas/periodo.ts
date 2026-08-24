// Datas da tela de Despesas — TUDO em aritmética UTC sobre string ISO.
//
// `data_vencimento` é DATA DE CALENDÁRIO ('2026-08-20'), não um instante. Não há
// fuso a resolver aqui — há fuso a NÃO INVENTAR: `new Date('2026-08-01')` é
// meia-noite UTC, que em BRT (-03) é 31/07. Este projeto já se queimou com isso
// mais de uma vez (ver lib/war-room/snapshot.ts, que usa o mesmo padrão daqui).
//
// Regra da casa: chave por slice, contas por Date.UTC + getUTC*, e nenhum
// toLocaleDateString em lugar nenhum.

const DIA_MS = 86400000

const MESES_LONGOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' → [ano, mês(1-12), dia] */
function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return [a, m, d]
}

function deUTC(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function paraUTC(iso: string): number {
  const [a, m, d] = partes(iso)
  return Date.UTC(a, m - 1, d)
}

export function somarDias(iso: string, dias: number): string {
  return deUTC(paraUTC(iso) + dias * DIA_MS)
}

/** Data de hoje em ISO, no fuso de São Paulo (a tela é usada no Brasil). */
export function hojeISO(agora: Date = new Date()): string {
  // -03:00 fixo: o Brasil não tem mais horário de verão desde 2019.
  return deUTC(agora.getTime() - 3 * 3600000)
}

/** Segunda-feira da semana de `iso` (semana segunda→domingo). */
export function segundaDaSemanaISO(iso: string): string {
  const ms = paraUTC(iso)
  const dow = new Date(ms).getUTCDay() // 0=domingo
  const recuo = dow === 0 ? 6 : dow - 1
  return deUTC(ms - recuo * DIA_MS)
}

/** Último dia do mês de uma chave 'YYYY-MM'. */
export function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return deUTC(Date.UTC(a, m, 0))
}

export function primeiroDiaDoMes(mes: string): string {
  return `${mes}-01`
}

export type Preset = '3m' | '6m' | '12m' | '24m'

export const PRESETS: { id: Preset; label: string; meses: number }[] = [
  { id: '3m', label: '3 meses', meses: 3 },
  { id: '6m', label: '6 meses', meses: 6 },
  { id: '12m', label: '12 meses', meses: 12 },
  { id: '24m', label: '24 meses', meses: 24 },
]

/** Intervalo fechado do preset: do dia 1º do mês (atual − n + 1) ao último dia
 *  do mês atual. Aritmética inteira de ano/mês — nada de setMonth, que estoura
 *  em dia 31 ("31 de março menos 1 mês" vira 3 de março). */
export function intervaloDoPreset(preset: Preset, hoje: string = hojeISO()): { de: string; ate: string } {
  const meses = PRESETS.find((p) => p.id === preset)?.meses ?? 12
  const [a, m] = partes(hoje)
  const totalMeses = a * 12 + (m - 1) - (meses - 1)
  const mesDe = `${Math.floor(totalMeses / 12)}-${pad2((totalMeses % 12) + 1)}`
  const mesAte = `${a}-${pad2(m)}`
  return { de: primeiroDiaDoMes(mesDe), ate: ultimoDiaDoMes(mesAte) }
}

/** Todos os meses do intervalo, inclusive os SEM despesa — senão o gráfico
 *  "pula" meses vazios e distorce a leitura da tendência. */
export function mesesDoIntervalo(de: string, ate: string): string[] {
  const [a1, m1] = partes(de)
  const [a2, m2] = partes(ate)
  const out: string[] = []
  for (let t = a1 * 12 + (m1 - 1); t <= a2 * 12 + (m2 - 1); t++) {
    out.push(`${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`)
  }
  return out
}

/** 'Agosto 2026' */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES_LONGOS[m - 1]} ${a}`
}

/** 'ago/26' — eixo do gráfico, onde espaço é curto */
export function rotuloMesCurto(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`
}

/** '17–23 ago' (as pontas já vêm recortadas pelo mês, então o mês é um só) */
export function rotuloSemana(inicio: string, fim: string): string {
  const [, mi, di] = partes(inicio)
  const [, , df] = partes(fim)
  return di === df ? `${di} ${MESES_CURTOS[mi - 1]}` : `${di}–${df} ${MESES_CURTOS[mi - 1]}`
}

/** '20' + 'qui' — o cabeçalho de dia da referência visual */
export function rotuloDia(iso: string): { numero: string; diaSemana: string } {
  const [, , d] = partes(iso)
  return { numero: String(d), diaSemana: DIAS_SEMANA[new Date(paraUTC(iso)).getUTCDay()] }
}

/** Rótulo do intervalo pro subtítulo do resumo: 'fev–ago/2026'. */
export function rotuloIntervalo(de: string, ate: string): string {
  const [a1, m1] = partes(de)
  const [a2, m2] = partes(ate)
  if (a1 === a2) return `${MESES_CURTOS[m1 - 1]}–${MESES_CURTOS[m2 - 1]}/${a1}`
  return `${MESES_CURTOS[m1 - 1]}/${String(a1).slice(2)}–${MESES_CURTOS[m2 - 1]}/${String(a2).slice(2)}`
}
