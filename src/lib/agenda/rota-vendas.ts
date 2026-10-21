// Rota da semana do app de vendas → compromissos na Agenda coletiva (regras PURAS).
// O app manda a semana inteira; aqui se decide o que criar, atualizar e cancelar
// comparando com o que já está na agenda daquela semana (origem = 'rota_vendas').
// Compromisso criado à mão nunca entra nesta conta.

export const ORIGEM_ROTA = 'rota_vendas'
export const MAX_ITENS_SEMANA = 80

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface ItemRota {
  ref: string
  dia: string // YYYY-MM-DD
  horaIni: string // HH:MM
  horaFim: string
  titulo: string
  local: string | null
  descricao: string | null
}

export interface EventoRotaDb {
  id: string
  origem_ref: string
  titulo: string
  local: string | null
  descricao: string | null
  inicio: string
  fim: string
}

export interface CamposEvento {
  origem_ref: string
  titulo: string
  local: string | null
  descricao: string | null
  inicio: string
  fim: string
}

/** Instante ISO no fuso de Brasília (-03:00) — mesmo critério da agenda (regras.ts). */
export function isoBR(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString()
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Segunda-feira da semana do dia informado. */
export function segundaDa(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  const dow = d.getUTCDay() // 0 = domingo
  return somarDias(dia, dow === 0 ? -6 : 1 - dow)
}

const texto = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, max) : null
}

/** Valida o corpo vindo do app. A semana vai de segunda a domingo. */
export function validarSemana(b: Record<string, unknown>):
  | { ok: true; semana: string; itens: ItemRota[] }
  | { ok: false; erro: string } {
  const semanaIn = String(b.semana ?? '')
  if (!DIA_RE.test(semanaIn)) return { ok: false, erro: 'Informe a semana (data da segunda-feira).' }
  const semana = segundaDa(semanaIn)
  const fimSemana = somarDias(semana, 6)
  if (!Array.isArray(b.itens)) return { ok: false, erro: 'Itens da rota ausentes.' }
  if (b.itens.length > MAX_ITENS_SEMANA) return { ok: false, erro: `No máximo ${MAX_ITENS_SEMANA} visitas por semana.` }
  const itens: ItemRota[] = []
  const refs = new Set<string>()
  for (const [i, bruto] of (b.itens as Record<string, unknown>[]).entries()) {
    const n = i + 1
    const ref = texto(bruto?.ref, 120)
    const dia = String(bruto?.dia ?? '')
    const horaIni = String(bruto?.horaIni ?? '').slice(0, 5)
    const horaFim = String(bruto?.horaFim ?? '').slice(0, 5)
    const titulo = texto(bruto?.titulo, 200)
    if (!ref) return { ok: false, erro: `Visita ${n}: falta a referência (ref).` }
    if (refs.has(ref)) return { ok: false, erro: `Visita ${n}: referência repetida (${ref}).` }
    if (!DIA_RE.test(dia) || dia < semana || dia > fimSemana) return { ok: false, erro: `Visita ${n}: o dia tem de estar na semana de ${semana}.` }
    if (!HORA_RE.test(horaIni) || !HORA_RE.test(horaFim) || horaFim <= horaIni) return { ok: false, erro: `Visita ${n}: horário inválido.` }
    if (!titulo) return { ok: false, erro: `Visita ${n}: falta o título.` }
    refs.add(ref)
    itens.push({ ref, dia, horaIni, horaFim, titulo, local: texto(bruto?.local, 200), descricao: texto(bruto?.descricao, 4000) })
  }
  return { ok: true, semana, itens }
}

export function camposDoItem(it: ItemRota): CamposEvento {
  return {
    origem_ref: it.ref,
    titulo: it.titulo,
    local: it.local,
    descricao: it.descricao,
    inicio: isoBR(it.dia, it.horaIni),
    fim: isoBR(it.dia, it.horaFim),
  }
}

const mesmoInstante = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime()

/** O que fazer para a agenda ficar igual à rota enviada. */
export function planejarSincronizacao(existentes: EventoRotaDb[], itens: ItemRota[]): {
  criar: CamposEvento[]
  atualizar: { id: string; campos: CamposEvento }[]
  cancelar: string[]
  iguais: number
} {
  const porRef = new Map(existentes.map((e) => [e.origem_ref, e]))
  const criar: CamposEvento[] = []
  const atualizar: { id: string; campos: CamposEvento }[] = []
  let iguais = 0
  const usados = new Set<string>()
  for (const it of itens) {
    const campos = camposDoItem(it)
    const atual = porRef.get(it.ref)
    if (!atual) { criar.push(campos); continue }
    usados.add(atual.id)
    const igual = atual.titulo === campos.titulo && (atual.local || null) === campos.local
      && (atual.descricao || null) === campos.descricao
      && mesmoInstante(atual.inicio, campos.inicio) && mesmoInstante(atual.fim, campos.fim)
    if (igual) iguais++
    else atualizar.push({ id: atual.id, campos })
  }
  const cancelar = existentes.filter((e) => !usados.has(e.id)).map((e) => e.id)
  return { criar, atualizar, cancelar, iguais }
}
