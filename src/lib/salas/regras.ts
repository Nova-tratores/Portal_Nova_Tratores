// AGENDA DA SALA DE REUNIÃO — regras puras (sem banco, testadas em __tests__).
// Fuso: horário de Brasília fixo (-03:00, sem horário de verão desde 2019), como o resto do portal.

export interface Sala { id: string; nome: string; capacidade: number | null; cor: string; ativa: boolean; ordem: number }

export interface Reserva {
  id: string
  sala_id: string
  inicio: string            // timestamptz ISO
  fim: string
  titulo: string
  descricao: string | null
  responsavel_id: string
  criado_por: string
  reuniao_id: string | null
  status: 'ativa' | 'cancelada'
  /** preenchidos pela API */
  responsavel_nome?: string | null
  reuniao_numero?: number | null
}

export const PASSO_MIN = 15
export const ABRE = '06:00'
export const FECHA = '22:00'
/** Faixa que a grade mostra (o resto rola). */
export const GRADE_INICIO = 7
export const GRADE_FIM = 20
export const DURACAO_MAX_MIN = 12 * 60
const OFFSET_MS = 3 * 3600 * 1000

type Validacao<T> = { ok: true; campos: T } | { ok: false; erro: string }

export const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** "YYYY-MM-DD" + "HH:MM" → timestamptz ISO em -03:00. */
export const isoDe = (dia: string, hora: string) => `${dia}T${hora.slice(0, 5)}:00-03:00`

/** Dia (YYYY-MM-DD) e hora (HH:MM) de Brasília de um timestamptz. */
export function localDe(ts: string): { dia: string; hora: string } {
  const s = new Date(new Date(ts).getTime() - OFFSET_MS).toISOString()
  return { dia: s.slice(0, 10), hora: s.slice(11, 16) }
}

export function addDias(dia: string, n: number): string {
  const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
/** 0 = domingo … 6 = sábado */
export const diaDaSemana = (dia: string) => new Date(dia + 'T12:00:00Z').getUTCDay()

/** Segunda-feira da semana do dia (domingo pertence à semana que termina nele). */
export function semanaDe(dia: string): string {
  const d = diaDaSemana(dia)
  return addDias(dia, d === 0 ? -6 : 1 - d)
}
/** Seg a sáb da semana que começa na segunda dada (a loja não abre domingo). */
export const diasDaSemana = (segunda: string) => [0, 1, 2, 3, 4, 5].map((i) => addDias(segunda, i))

/** Intervalos [início, fim) se sobrepõem? Encostar (fim = início) não conta. */
export const sobrepoe = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) =>
  new Date(a.inicio).getTime() < new Date(b.fim).getTime() && new Date(b.inicio).getTime() < new Date(a.fim).getTime()

/** Valida o pedido de reserva. `agora` = { dia, hora } de Brasília. */
export function validarReserva(
  body: Record<string, unknown>,
  agora: { dia: string; hora: string },
): Validacao<{ dia: string; inicio: string; fim: string; titulo: string; descricao: string | null }> {
  const dia = String(body.dia ?? '')
  const ini = String(body.inicio ?? '').slice(0, 5)
  const fim = String(body.fim ?? '').slice(0, 5)
  const titulo = String(body.titulo ?? '').trim()
  const descricao = String(body.descricao ?? '').trim() || null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { ok: false, erro: 'Escolha o dia.' }
  if (!/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim)) return { ok: false, erro: 'Informe o horário de início e de fim.' }
  if (!titulo) return { ok: false, erro: 'Dê um título (ex.: "Visita cliente Fazenda Boa Vista").' }
  if (titulo.length > 200) return { ok: false, erro: 'Título: no máximo 200 caracteres.' }
  if (descricao && descricao.length > 2000) return { ok: false, erro: 'Detalhe: no máximo 2000 caracteres.' }
  const a = minutos(ini), b = minutos(fim)
  if (a % PASSO_MIN || b % PASSO_MIN) return { ok: false, erro: `Use horários de ${PASSO_MIN} em ${PASSO_MIN} minutos (ex.: 14:00, 14:15).` }
  if (b <= a) return { ok: false, erro: 'O fim tem de ser depois do início.' }
  if (a < minutos(ABRE) || b > minutos(FECHA)) return { ok: false, erro: `A sala pode ser reservada das ${ABRE} às ${FECHA}.` }
  if (b - a > DURACAO_MAX_MIN) return { ok: false, erro: 'Uma reserva vai até 12 horas.' }
  if (dia < agora.dia || (dia === agora.dia && fim <= agora.hora)) return { ok: false, erro: 'Esse horário já passou.' }
  return { ok: true, campos: { dia, inicio: ini, fim, titulo, descricao } }
}

/** Texto do conflito: "Ocupada por Larissa · Treinamento · 14:00–15:00". */
export function rotuloConflito(r: Pick<Reserva, 'inicio' | 'fim' | 'titulo' | 'responsavel_nome'>): string {
  const quem = (r.responsavel_nome || '').split(' ')[0]
  return `Ocupada${quem ? ` por ${quem}` : ''} · ${r.titulo} · ${localDe(r.inicio).hora}–${localDe(r.fim).hora}`
}

/** Posição do bloco na grade (px), recortada à faixa visível. */
export function posicaoNaGrade(inicio: string, fim: string, pxPorHora: number, gradeInicio = GRADE_INICIO, gradeFim = GRADE_FIM) {
  const a = Math.max(minutos(localDe(inicio).hora), gradeInicio * 60)
  const b = Math.min(minutos(localDe(fim).hora) || 24 * 60, gradeFim * 60)
  return { top: ((a - gradeInicio * 60) / 60) * pxPorHora, altura: Math.max(((b - a) / 60) * pxPorHora, pxPorHora / 4) }
}

/** Minuto (múltiplo do passo) correspondente a um y (px) dentro da grade. */
export function minutoDoY(y: number, pxPorHora: number, gradeInicio = GRADE_INICIO, passo = PASSO_MIN): number {
  const bruto = gradeInicio * 60 + (y / pxPorHora) * 60
  return Math.max(gradeInicio * 60, Math.floor(bruto / passo) * passo)
}

/** Reservas de um dia (Brasília), em ordem de início. */
export const reservasDoDia = (rs: Reserva[], dia: string) =>
  rs.filter((r) => r.status === 'ativa' && localDe(r.inicio).dia === dia).sort((x, y) => x.inicio.localeCompare(y.inicio))

/** Duração da reunião → fim "HH:MM" (fecha no máximo 23:59 do mesmo dia). */
export function fimDaReuniao(hora: string, duracaoMin: number): string {
  return hhmm(Math.min(minutos(hora.slice(0, 5)) + Math.max(5, duracaoMin), 23 * 60 + 59))
}
