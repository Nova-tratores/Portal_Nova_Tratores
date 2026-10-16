// Painel do pós-vendas por técnico (José, 16/10/2026) — regras PURAS (testadas).
//
// Decisões do José:
//  - Horas TRABALHADAS = relatório do app do técnico (dias com início/fim). Cada técnico
//    do relatório (TecResp1 e TecResp2) fica com as horas que registrou.
//  - Horas FATURADAS = horas cobradas nas OS faturadas no período (pela data do faturamento).
//    OS com 2 técnicos: horas cobradas repartidas pelo que cada um registrou na OS
//    (sem registro, meio a meio); VALOR e KM divididos igualmente.
//  - Horas INTERNAS = horas do relatório em OS interna.
//  - Meta = 8 h por dia útil (SEGUNDA a SEXTA) → 40 h na semana; sábado/domingo = extra.
//  - OCIOSAS = meta − (faturadas + internas), nunca negativo.
//  - Valor gerado = serviço (horas) + km + peças (PPV) + outros; CUSTO de terceiros =
//    requisições da OS; LÍQUIDO = bruto − custo. OS interna não gera faturamento.

export const SEM_TECNICO = 'Sem técnico'
export const HORAS_DIA = 8

export interface DiaRegistrado { os: string; data: string; tecnico: string; horas: number; interna: boolean }

export interface OSFaturada {
  os: string                 // Id_Ordem do portal (ou "OMIE <nº>" quando só existe no Omie)
  numeroOmie: string | null
  cliente: string
  data: string               // YYYY-MM-DD do faturamento
  em: string | null          // ISO completo quando se sabe a hora (faturado pelo portal)
  tecnicos: string[]         // nomes já padronizados
  horasCobradas: number
  km: number
  servico: number            // R$ das horas
  kmValor: number            // R$ do km
  pecas: number              // R$ das peças (PPV)
  outros: number             // requisições repassadas, extras, desconto geral
  bruto: number
  custo: number              // requisições (fornecedores) da OS
  custoPorTipo?: Record<string, number>
}

export interface LinhaTecnico {
  tecnico: string
  trabalhadas: number   // seg–sex, relatório
  cliente: number       // trabalhadas em OS de cliente
  internas: number      // trabalhadas em OS interna
  extras: number        // sábado/domingo
  faturadas: number     // horas cobradas nas OS faturadas
  ociosas: number
  meta: number
  km: number
  servico: number; kmValor: number; pecas: number; outros: number
  bruto: number; custo: number; liquido: number
  os: number            // OS faturadas (fração quando dividida)
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** 0 = domingo … 6 = sábado, para 'YYYY-MM-DD' (meio-dia UTC: sem efeito de fuso). */
export function diaSemana(dia: string): number { return new Date(`${dia}T12:00:00Z`).getUTCDay() }
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
/** Segunda-feira da semana do dia. */
export function segundaDa(dia: string): string { const w = diaSemana(dia); return somarDias(dia, w === 0 ? -6 : 1 - w) }
export function diasUteis(de: string, ate: string): number {
  let n = 0
  for (let d = de; d <= ate; d = somarDias(d, 1)) { const w = diaSemana(d); if (w >= 1 && w <= 5) n++ }
  return n
}

function linhaVazia(tecnico: string, meta: number): LinhaTecnico {
  return { tecnico, trabalhadas: 0, cliente: 0, internas: 0, extras: 0, faturadas: 0, ociosas: 0, meta, km: 0, servico: 0, kmValor: 0, pecas: 0, outros: 0, bruto: 0, custo: 0, liquido: 0, os: 0 }
}

/**
 * Agrega o período [de, ate] por técnico. `tecnicos` = os que sempre aparecem (mesmo zerados).
 * `pesos` (opcional) = horas registradas por OS e técnico em QUALQUER data, para repartir as
 * horas cobradas de OS com 2 técnicos.
 */
export function agregar(
  de: string, ate: string, tecnicos: string[], dias: DiaRegistrado[], faturadas: OSFaturada[],
  pesos?: Map<string, Map<string, number>>,
): { linhas: LinhaTecnico[]; total: LinhaTecnico } {
  const meta = diasUteis(de, ate) * HORAS_DIA
  const m = new Map<string, LinhaTecnico>()
  const de_ = (t: string) => { let l = m.get(t); if (!l) { l = linhaVazia(t, meta); m.set(t, l) } return l }
  for (const t of tecnicos) de_(t)

  for (const d of dias) {
    if (d.data < de || d.data > ate || !(d.horas > 0)) continue
    const l = de_(d.tecnico)
    const w = diaSemana(d.data)
    if (w === 0 || w === 6) { l.extras += d.horas; continue }
    l.trabalhadas += d.horas
    if (d.interna) l.internas += d.horas; else l.cliente += d.horas
  }

  for (const o of faturadas) {
    if (o.data < de || o.data > ate) continue
    const tecs = o.tecnicos.length ? o.tecnicos : [SEM_TECNICO]
    const n = tecs.length
    const reg = pesos?.get(o.os)
    const somaReg = reg ? tecs.reduce((s, t) => s + (reg.get(t) || 0), 0) : 0
    for (const t of tecs) {
      const l = de_(t)
      const pesoH = somaReg > 0 ? (reg!.get(t) || 0) / somaReg : 1 / n
      l.faturadas += o.horasCobradas * pesoH
      l.km += o.km / n
      l.servico += o.servico / n; l.kmValor += o.kmValor / n; l.pecas += o.pecas / n; l.outros += o.outros / n
      l.bruto += o.bruto / n; l.custo += o.custo / n
      l.os += 1 / n
    }
  }

  const linhas = [...m.values()].map((l) => {
    const x = { ...l }
    x.liquido = x.bruto - x.custo
    x.ociosas = l.tecnico === SEM_TECNICO ? 0 : Math.max(0, x.meta - x.faturadas - x.internas)
    for (const k of ['trabalhadas', 'cliente', 'internas', 'extras', 'faturadas', 'ociosas', 'km', 'servico', 'kmValor', 'pecas', 'outros', 'bruto', 'custo', 'liquido', 'os'] as const) x[k] = r2(x[k])
    return x
  }).sort((a, b) => (a.tecnico === SEM_TECNICO ? 1 : b.tecnico === SEM_TECNICO ? -1 : b.bruto - a.bruto || a.tecnico.localeCompare(b.tecnico, 'pt-BR')))

  const total = linhas.reduce((t, l) => {
    for (const k of ['trabalhadas', 'cliente', 'internas', 'extras', 'faturadas', 'km', 'servico', 'kmValor', 'pecas', 'outros', 'bruto', 'custo', 'liquido', 'os'] as const) t[k] = r2(t[k] + l[k])
    return t
  }, linhaVazia('Equipe', 0))
  const comMeta = linhas.filter((l) => l.tecnico !== SEM_TECNICO)
  total.meta = r2(meta * comMeta.length)
  total.ociosas = r2(comMeta.reduce((s, l) => s + l.ociosas, 0))
  return { linhas, total }
}

export interface Bucket { rotulo: string; de: string; ate: string }

/** As últimas `n` semanas (segunda a domingo; a meta conta só seg–sex) terminando na semana de `hoje`. */
export function ultimasSemanas(hoje: string, n: number): Bucket[] {
  const seg = segundaDa(hoje)
  return Array.from({ length: n }, (_, i) => {
    const de = somarDias(seg, -7 * (n - 1 - i))
    return { rotulo: `${de.slice(8, 10)}/${de.slice(5, 7)}`, de, ate: somarDias(de, 6) }
  })
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** Os últimos `n` meses terminando no mês de `hoje`. */
export function ultimosMeses(hoje: string, n: number): Bucket[] {
  const [a, mm] = hoje.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const k = (a * 12 + (mm - 1)) - (n - 1 - i)
    const ano = Math.floor(k / 12), mes = (k % 12) + 1
    const de = `${ano}-${String(mes).padStart(2, '0')}-01`
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    return { rotulo: `${MESES[mes - 1]}/${String(ano).slice(2)}`, de, ate: `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}` }
  })
}

/** Horas registradas por OS e técnico (para repartir as horas cobradas). */
export function pesosPorOS(dias: DiaRegistrado[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const d of dias) {
    const x = m.get(d.os) || new Map<string, number>()
    x.set(d.tecnico, (x.get(d.tecnico) || 0) + d.horas)
    m.set(d.os, x)
  }
  return m
}
