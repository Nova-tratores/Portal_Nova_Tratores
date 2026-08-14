// Revisões pagas pela MAHINDRA (50h e 900h): extração das realizadas a partir
// da tabela `tratores` (colunas "50h Data"/"900h Data" etc.). As datas são
// TEXTO em formatos MISTURADOS — dd/mm/aaaa (maioria) e yyyy-mm-dd (linhas
// gravadas por <input type="date">, como Entrega e algumas "50h Data") — por
// isso todo parse/exibição passa por parseDia/formatBR. Timestamps em UTC pra
// tela, filtro e célula de data do Excel baterem em qualquer fuso do servidor.
// Compartilhado pela tela /revisoes/mahindra e pela rota do Excel.

export interface TratorRow {
  ID: string
  Modelo: string | null
  Chassis: string | null
  Cliente: string | null
  Cidade: string | null
  Vendedor: string | null
  Entrega: string | null
  Numero_Motor: string | null
  [k: string]: unknown
}

export type TipoRevisao = '50h' | '900h' | 'inspecao'

export const REV_LABEL: Record<TipoRevisao, string> = {
  '50h': '50h',
  '900h': '900h',
  inspecao: 'Pré-entrega',
}

// Prefixo das colunas na tabela tratores ("50h Data", "Inspecao Data", ...).
const PREFIXO: Record<TipoRevisao, string> = { '50h': '50h', '900h': '900h', inspecao: 'Inspecao' }

export interface LinhaRevisao {
  tratorId: string
  revisao: TipoRevisao
  data: string // sempre exibida como dd/mm/aaaa (normalizada)
  dataOrd: number // meia-noite UTC do dia (0 = data inválida/ilegível)
  horimetro: string
  chassis: string
  modelo: string
  motor: string
  cliente: string
  cidade: string
  vendedor: string
  entrega: string
  pdf: string
}

// "dd/mm/aaaa" OU "yyyy-mm-dd" -> {dia, mes, ano} (null = ilegível)
function parseDia(texto: string): { dia: number; mes: number; ano: number } | null {
  const s = String(texto || '').trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return { dia: Number(m[1]), mes: Number(m[2]), ano: Number(m[3]) }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return { dia: Number(m[3]), mes: Number(m[2]), ano: Number(m[1]) }
  return null
}

// -> timestamp da meia-noite UTC do dia (0 = inválida)
export function ordDe(dataTexto: string): number {
  const p = parseDia(dataTexto)
  return p ? Date.UTC(p.ano, p.mes - 1, p.dia) : 0
}

// Normaliza pra dd/mm/aaaa; texto ilegível volta como veio (trim).
export function formatBR(dataTexto: string): string {
  const p = parseDia(dataTexto)
  if (!p) return String(dataTexto || '').trim()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(p.dia)}/${pad(p.mes)}/${p.ano}`
}

/** Uma linha por (trator × revisão 50h/900h ou inspeção de pré-entrega realizada), mais recente primeiro. */
export function extrairLinhas(tratores: TratorRow[]): LinhaRevisao[] {
  const out: LinhaRevisao[] = []
  for (const t of tratores) {
    for (const rev of ['50h', '900h', 'inspecao'] as const) {
      const pref = PREFIXO[rev]
      const dataRaw = String(t[`${pref} Data`] || '').trim()
      if (!dataRaw) continue
      out.push({
        tratorId: String(t.ID),
        revisao: rev,
        data: formatBR(dataRaw),
        dataOrd: ordDe(dataRaw),
        horimetro: String(t[`${pref} Horimetro`] || '').trim(),
        chassis: String(t.Chassis || '').trim(),
        modelo: String(t.Modelo || '').trim(),
        motor: String(t.Numero_Motor || '').trim(),
        cliente: String(t.Cliente || '').trim(),
        cidade: String(t.Cidade || '').trim(),
        vendedor: String(t.Vendedor || '').trim(),
        entrega: formatBR(String(t.Entrega || '')),
        pdf: String(t[`${pref} PDF`] || '').trim(),
      })
    }
  }
  // Desempate por chassi/revisão: a query não tem ORDER BY, então sem isso a
  // ordem de datas iguais mudaria entre tela e Excel (queries independentes).
  return out.sort(
    (a, b) => b.dataOrd - a.dataOrd || a.chassis.localeCompare(b.chassis) || a.revisao.localeCompare(b.revisao),
  )
}

/** Aplica os filtros da tela/da rota do Excel (mesma semântica nos dois). */
export function filtrarLinhas(
  linhas: LinhaRevisao[],
  f: { tipo?: string; de?: string; ate?: string; q?: string },
): LinhaRevisao[] {
  // de/ate chegam como yyyy-mm-dd (input date / query param) → dia em UTC,
  // mesmo referencial do dataOrd.
  const deOrd = f.de ? ordDe(f.de) : 0
  const ateOrd = f.ate ? ordDe(f.ate) + 86399999 : Infinity
  const termo = (f.q || '').trim().toLowerCase()
  return linhas.filter(l => {
    if ((f.tipo === '50h' || f.tipo === '900h' || f.tipo === 'inspecao') && l.revisao !== f.tipo) return false
    if (l.dataOrd < deOrd || l.dataOrd > ateOrd) return false
    if (termo && !`${l.chassis} ${l.cliente} ${l.modelo} ${l.cidade}`.toLowerCase().includes(termo)) return false
    return true
  })
}
