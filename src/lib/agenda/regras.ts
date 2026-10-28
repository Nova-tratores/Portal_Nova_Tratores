// AGENDA COLETIVA — regras puras (sem banco; testadas em __tests__/regras.test.ts).
// Uma agenda estilo Google Agenda que junta: compromissos criados nela (agenda_eventos),
// reuniões, reservas da sala, prazos de tickets, OS do POS e a Lousa dos técnicos.
// Fuso: Brasília fixo (-03:00), igual ao resto do portal (ver lib/salas/regras.ts).
import { addDias, isoDe, localDe, minutos, hhmm, diaDaSemana } from '@/lib/salas/regras'

export { addDias, isoDe, localDe, minutos, hhmm, diaDaSemana }

export type Fonte = 'evento' | 'reuniao' | 'sala' | 'ticket' | 'os' | 'lousa'
export type Freq = 'diaria' | 'dias_uteis' | 'semanal' | 'mensal'
export type Resposta = 'pendente' | 'sim' | 'nao' | 'talvez'

export interface Pessoa {
  id: string
  nome: string
  setor: string
  avatar_url?: string | null
  tecnico: boolean
  /** nome do técnico na Lousa/POS (portal_permissoes.mecanico_tecnico_nome) */
  tecnicoNome?: string | null
  cor: string
}

export interface ItemAgenda {
  /** único por ocorrência (séries repetem o mesmo `ref`) */
  id: string
  /** id na tabela de origem */
  ref: string
  fonte: Fonte
  titulo: string
  /** timestamptz ISO. Dia inteiro: [dia 00:00, dia seguinte ao último 00:00) */
  inicio: string
  fim: string
  diaInteiro: boolean
  pessoas: string[]
  cor?: string | null
  local?: string | null
  descricao?: string | null
  link?: string | null
  detalhes?: [string, string][]
  podeEditar?: boolean
  esmaecido?: boolean
  criadoPor?: string | null
  respostas?: Record<string, Resposta>
  serie?: { freq: Freq; ate: string | null } | null
  /** dia (YYYY-MM-DD) desta ocorrência, quando é de uma série */
  ocorrencia?: string | null
  extra?: Record<string, unknown>
}

export const FONTES: { id: Fonte; rotulo: string }[] = [
  { id: 'evento', rotulo: 'Compromissos' },
  { id: 'reuniao', rotulo: 'Reuniões' },
  { id: 'sala', rotulo: 'Reservas da sala' },
  { id: 'ticket', rotulo: 'Prazos de tickets' },
  { id: 'os', rotulo: 'OS dos técnicos' },
  { id: 'lousa', rotulo: 'Lousa dos técnicos' },
]

export const FREQ_ROTULO: Record<Freq, string> = {
  diaria: 'Todos os dias', dias_uteis: 'Dias úteis (seg. a sex.)', semanal: 'Toda semana', mensal: 'Todo mês',
}

// ------------------------------------------------------------------ cores
/** Paleta do Google Agenda (nomes em pt-BR) + extras para equipes grandes. */
export const PALETA: { nome: string; cor: string }[] = [
  { nome: 'Pavão', cor: '#039be5' }, { nome: 'Sálvia', cor: '#33b679' }, { nome: 'Tangerina', cor: '#f4511e' },
  { nome: 'Uva', cor: '#8e24aa' }, { nome: 'Banana', cor: '#f6bf26' }, { nome: 'Mirtilo', cor: '#3f51b5' },
  { nome: 'Flamingo', cor: '#e67c73' }, { nome: 'Manjericão', cor: '#0b8043' }, { nome: 'Lavanda', cor: '#7986cb' },
  { nome: 'Tomate', cor: '#d50000' }, { nome: 'Grafite', cor: '#616161' }, { nome: 'Cereja', cor: '#ad1457' },
  { nome: 'Abóbora', cor: '#ef6c00' }, { nome: 'Eucalipto', cor: '#009688' }, { nome: 'Cacau', cor: '#795548' },
  { nome: 'Pistache', cor: '#7cb342' }, { nome: 'Cobalto', cor: '#4285f4' }, { nome: 'Ameixa', cor: '#5e35b1' },
]

/** Cor de cada pessoa: distinta enquanto houver cor na paleta (ordem alfabética, estável). */
export function coresPorPessoa(pessoas: { id: string; nome: string }[]): Map<string, string> {
  const ord = [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
  return new Map(ord.map((p, i) => [p.id, PALETA[i % PALETA.length].cor]))
}

/** Texto legível sobre a cor (preto em cores claras como Banana). */
export function textoSobre(cor: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(cor.trim())
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#202124' : '#fff'
}

// ------------------------------------------------------------------ setores
export const SETORES_ORDEM = ['Diretoria', 'Comercial', 'Pós-Vendas', 'Peças', 'Financeiro', 'T.I.', 'Técnicos', 'Outros']

export const normTexto = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Setor a partir da função do cadastro. `null` = fora da agenda (contas de teste). */
export function setorDe(funcao: string | null | undefined, tecnico: boolean): string | null {
  const f = normTexto(funcao)
  if (/\bteste\b/.test(f)) return null
  if (tecnico || /^tecnic|^mecanic/.test(f)) return 'Técnicos'
  if (!f) return 'Outros'
  if (/^pos[\s-]?vendas?$/.test(f)) return 'Pós-Vendas'
  if (/^pecas?$/.test(f)) return 'Peças'
  if (/^t\.?\s?i\.?$/.test(f)) return 'T.I.'
  if (f === 'comercial' || f === 'vendas') return 'Comercial'
  if (f === 'financeiro') return 'Financeiro'
  if (/^diretor/.test(f)) return 'Diretoria'
  return String(funcao).trim().replace(/^\p{L}/u, (c) => c.toUpperCase())
}

export function ordemSetor(a: string, b: string) {
  const ia = SETORES_ORDEM.indexOf(a), ib = SETORES_ORDEM.indexOf(b)
  return (ia < 0 ? 50 : ia) - (ib < 0 ? 50 : ib) || a.localeCompare(b, 'pt-BR')
}

// ------------------------------------------------------------------ datas
export const DIA_RE = /^\d{4}-\d{2}-\d{2}$/
export const HORA_RE = /^\d{2}:\d{2}$/

/** Domingo da semana do dia (semana do Google Agenda em pt-BR: dom → sáb). */
export const domingoDe = (dia: string) => addDias(dia, -diaDaSemana(dia))
export const primeiroDoMes = (dia: string) => dia.slice(0, 8) + '01'
export function somarMeses(dia: string, n: number): string {
  const [a, m] = dia.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}
/** As 6 semanas (42 dias) da grade do mês, começando no domingo. */
export const gradeDoMes = (dia: string) => {
  const ini = domingoDe(primeiroDoMes(dia))
  return Array.from({ length: 42 }, (_, i) => addDias(ini, i))
}
export const diasEntre = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 864e5)

/** Último dia (inclusive) ocupado por um item. Dia inteiro: fim é exclusivo. */
export function ultimoDia(it: Pick<ItemAgenda, 'inicio' | 'fim' | 'diaInteiro'>): string {
  const f = localDe(it.fim)
  if (it.diaInteiro || f.hora === '00:00') return addDias(f.dia, -1) < localDe(it.inicio).dia ? localDe(it.inicio).dia : addDias(f.dia, -1)
  return f.dia
}
/** O item aparece no dia? */
export const tocaDia = (it: Pick<ItemAgenda, 'inicio' | 'fim' | 'diaInteiro'>, dia: string) =>
  localDe(it.inicio).dia <= dia && ultimoDia(it) >= dia

/** Vai para a faixa "dia inteiro" do topo (dia inteiro ou passa de um dia)? */
export const noTopo = (it: Pick<ItemAgenda, 'inicio' | 'fim' | 'diaInteiro'>) =>
  it.diaInteiro || ultimoDia(it) !== localDe(it.inicio).dia

// ------------------------------------------------------------------ repetição
/**
 * Dias de início das ocorrências de uma série que podem aparecer em [de, ate].
 * `duracaoDias` = quantos dias uma ocorrência ocupa além do 1º (pega a que começa antes e invade).
 */
export function ocorrencias(
  inicioDia: string, freq: Freq, ateSerie: string | null, excecoes: readonly string[],
  de: string, ate: string, duracaoDias = 0,
): string[] {
  const limite = ateSerie && ateSerie < ate ? ateSerie : ate
  const desde = addDias(de, -duracaoDias)
  const fora = new Set(excecoes)
  const out: string[] = []
  const usar = (d: string) => { if (d >= desde && !fora.has(d)) out.push(d) }
  if (freq === 'mensal') {
    // mesmo dia do mês; mês sem esse dia (31 em abril) fica sem ocorrência
    const diaMes = Number(inicioDia.slice(8, 10))
    for (let k = 0; k < 600; k++) {
      const [a, m] = somarMeses(inicioDia, k).split('-').map(Number)
      if (new Date(Date.UTC(a, m - 1, diaMes)).getUTCMonth() !== m - 1) continue
      const d = `${a}-${String(m).padStart(2, '0')}-${String(diaMes).padStart(2, '0')}`
      if (d > limite) break
      usar(d)
    }
    return out
  }
  // pula direto para perto da janela (série antiga não percorre anos à toa)
  const passo = freq === 'semanal' ? 7 : 1
  const pular = Math.max(0, Math.floor(diasEntre(inicioDia, desde) / passo))
  for (let i = 0, d = addDias(inicioDia, pular * passo); i < 3000 && d <= limite; i++, d = addDias(d, passo)) {
    if (freq === 'dias_uteis' && (diaDaSemana(d) === 0 || diaDaSemana(d) === 6)) continue
    usar(d)
  }
  return out
}

// ------------------------------------------------------------------ encaixe na grade
/** Colunas lado a lado para itens que se sobrepõem num dia (algoritmo do Google Agenda). */
export function organizarColunas(itens: { id: string; ini: number; fim: number }[]): Map<string, { col: number; total: number }> {
  const ord = [...itens].sort((a, b) => a.ini - b.ini || b.fim - a.fim)
  const res = new Map<string, { col: number; total: number }>()
  let grupo: { id: string; col: number }[] = []
  let colunas: number[] = [] // fim do último item de cada coluna
  let fimGrupo = -Infinity
  const fechar = () => { for (const g of grupo) res.set(g.id, { col: g.col, total: colunas.length }); grupo = []; colunas = [] }
  for (const it of ord) {
    if (it.ini >= fimGrupo) fechar()
    let c = colunas.findIndex((f) => f <= it.ini)
    if (c < 0) { c = colunas.length; colunas.push(it.fim) } else colunas[c] = it.fim
    grupo.push({ id: it.id, col: c })
    fimGrupo = Math.max(fimGrupo === -Infinity ? it.fim : fimGrupo, it.fim)
  }
  fechar()
  return res
}

/** Empilha barras de vários dias na faixa do topo: linha de cada item. */
export function empilharTopo(itens: { id: string; ini: string; fim: string }[]): Map<string, number> {
  const ord = [...itens].sort((a, b) => a.ini.localeCompare(b.ini) || b.fim.localeCompare(a.fim))
  const linhas: string[] = [] // último dia ocupado por linha
  const res = new Map<string, number>()
  for (const it of ord) {
    let l = linhas.findIndex((f) => f < it.ini)
    if (l < 0) { l = linhas.length; linhas.push(it.fim) } else linhas[l] = it.fim
    res.set(it.id, l)
  }
  return res
}

// ------------------------------------------------------------------ OS do POS
const OS_ATIVAS = /^(execu|aguardando ordem|orcamento|orçamento|aberta|agendad)/i

/** Dias de execução da OS: "Dias_Execucao" (lista) ou a previsão de execução. */
export function diasDaOS(o: { Dias_Execucao?: string | null; Previsao_Execucao?: string | null; Data?: string | null }): string[] {
  // cada entrada pode vir com o horário junto ("2026-04-24 15:30-18:00"): vale o dia do começo
  const lista = String(o.Dias_Execucao || '').split(',').map((s) => s.trim().slice(0, 10)).filter((s) => DIA_RE.test(s))
  if (lista.length) return [...new Set(lista)].sort()
  const d = DIA_RE.test(o.Previsao_Execucao || '') ? o.Previsao_Execucao! : DIA_RE.test(o.Data || '') ? o.Data! : null
  return d ? [d] : []
}
export const osCancelada = (status: string | null | undefined) => /cancel/i.test(status || '')
export const osEmAberto = (status: string | null | undefined) => OS_ATIVAS.test(normTexto(status))

/** Junta dias seguidos (seg-sáb: domingo não quebra a sequência) em faixas [ini, fim]. */
export function faixasDeDias(dias: string[]): [string, string][] {
  const out: [string, string][] = []
  for (const d of [...dias].sort()) {
    const ult = out[out.length - 1]
    if (ult && (addDias(ult[1], 1) === d || (diaDaSemana(addDias(ult[1], 1)) === 0 && addDias(ult[1], 2) === d))) ult[1] = d
    else out.push([d, d])
  }
  return out
}

/** "Solicitação do cliente: X" do texto da OS. */
export function solicitacaoDaOS(texto: string | null | undefined): string {
  const m = /solicita[cç][aã]o do cliente:\s*(.+)/i.exec(texto || '')
  return (m?.[1] || '').trim()
}

// ------------------------------------------------------------------ Lousa
export type PeriodoLousa = 'manha' | 'tarde' | 'dia'
export const PERIODOS: Record<PeriodoLousa, { rotulo: string; ini: string; fim: string }> = {
  manha: { rotulo: 'Manhã', ini: '08:00', fim: '12:00' },
  tarde: { rotulo: 'Tarde', ini: '13:00', fim: '18:00' },
  dia: { rotulo: 'Dia todo', ini: '08:00', fim: '18:00' },
}
export const periodoLousa = (p: unknown): PeriodoLousa => (p === 'tarde' || p === 'dia' ? p : 'manha')
/** Período da Lousa a partir de um intervalo escolhido na grade. */
export function periodoDoHorario(ini: string, fim: string): PeriodoLousa {
  if (minutos(fim) <= 12 * 60 + 30) return 'manha'
  if (minutos(ini) >= 12 * 60) return 'tarde'
  return 'dia'
}
export type TipoLousa = 'servico' | 'faltou' | 'feriado' | 'oficina' | 'saida'
export const TIPOS_LOUSA: Record<TipoLousa, { rotulo: string; cor: string }> = {
  servico: { rotulo: 'Serviço', cor: '#039be5' },
  oficina: { rotulo: 'Oficina', cor: '#009688' },
  faltou: { rotulo: 'Faltou', cor: '#d50000' },
  feriado: { rotulo: 'Feriado', cor: '#f6bf26' },
  saida: { rotulo: 'Saída antecipada', cor: '#8e24aa' },
}
export const tipoLousa = (t: unknown): TipoLousa => (typeof t === 'string' && t in TIPOS_LOUSA ? (t as TipoLousa) : 'servico')

// ------------------------------------------------------------------ validação
export interface NovoEvento {
  titulo: string
  descricao: string | null
  local: string | null
  diaInteiro: boolean
  inicio: string
  fim: string
  participantes: string[]
  recorrencia: { freq: Freq; ate: string | null } | null
  cor: string | null
}

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

/**
 * Corpo: { titulo, descricao?, local?, diaInteiro?, diaIni, horaIni?, diaFim, horaFim?,
 *          participantes?: uuid[], recorrencia?: {freq, ate?} | null, cor? }
 */
export function validarEvento(b: Record<string, unknown>): { ok: true; campos: NovoEvento } | { ok: false; erro: string } {
  const titulo = String(b.titulo ?? '').trim()
  const descricao = String(b.descricao ?? '').trim() || null
  const local = String(b.local ?? '').trim() || null
  const diaInteiro = b.diaInteiro === true
  const diaIni = String(b.diaIni ?? ''), diaFim = String(b.diaFim ?? b.diaIni ?? '')
  const horaIni = String(b.horaIni ?? '').slice(0, 5), horaFim = String(b.horaFim ?? '').slice(0, 5)
  if (!titulo) return { ok: false, erro: 'Dê um título ao compromisso.' }
  if (titulo.length > 200) return { ok: false, erro: 'Título: no máximo 200 caracteres.' }
  if (descricao && descricao.length > 4000) return { ok: false, erro: 'Descrição: no máximo 4000 caracteres.' }
  if (local && local.length > 200) return { ok: false, erro: 'Local: no máximo 200 caracteres.' }
  if (!DIA_RE.test(diaIni) || !DIA_RE.test(diaFim)) return { ok: false, erro: 'Escolha a data.' }
  let inicio: string, fim: string
  if (diaInteiro) {
    if (diaFim < diaIni) return { ok: false, erro: 'A data final tem de ser igual ou depois da inicial.' }
    inicio = isoDe(diaIni, '00:00'); fim = isoDe(addDias(diaFim, 1), '00:00')
  } else {
    if (!HORA_RE.test(horaIni) || !HORA_RE.test(horaFim)) return { ok: false, erro: 'Informe o horário.' }
    inicio = isoDe(diaIni, horaIni); fim = isoDe(diaFim, horaFim)
    if (new Date(fim) <= new Date(inicio)) return { ok: false, erro: 'O fim tem de ser depois do início.' }
  }
  if (diasEntre(diaIni, diaFim) > 62) return { ok: false, erro: 'Um compromisso vai até 2 meses.' }
  const participantes = Array.isArray(b.participantes) ? [...new Set(b.participantes.filter(uuid))] : []
  if (participantes.length > 60) return { ok: false, erro: 'No máximo 60 convidados.' }
  let recorrencia: NovoEvento['recorrencia'] = null
  const r = b.recorrencia as { freq?: unknown; ate?: unknown } | null | undefined
  if (r && typeof r === 'object' && r.freq) {
    if (!(['diaria', 'dias_uteis', 'semanal', 'mensal'] as unknown[]).includes(r.freq)) return { ok: false, erro: 'Repetição inválida.' }
    const ate = r.ate ? String(r.ate) : null
    if (ate && (!DIA_RE.test(ate) || ate < diaIni)) return { ok: false, erro: '"Repetir até" tem de ser depois do 1º dia.' }
    recorrencia = { freq: r.freq as Freq, ate }
  }
  const cor = typeof b.cor === 'string' && /^#[0-9a-f]{6}$/i.test(b.cor) ? b.cor : null
  return { ok: true, campos: { titulo, descricao, local, diaInteiro, inicio, fim, participantes, recorrencia, cor } }
}

// ------------------------------------------------------------------ busca
export function casaItem(it: ItemAgenda, termo: string, nomes: Map<string, string>): boolean {
  const t = normTexto(termo)
  if (!t) return true
  const alvo = normTexto([it.titulo, it.local, it.descricao, ...it.pessoas.map((p) => nomes.get(p) || ''), ...(it.detalhes || []).map((d) => d[1])].join(' '))
  return t.split(' ').every((p) => alvo.includes(p))
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const DIAS_CURTOS = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.']
export const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/** "13:00 – 14:30" / "Dia inteiro" para o popover. */
export function rotuloHorario(it: Pick<ItemAgenda, 'inicio' | 'fim' | 'diaInteiro'>): string {
  const a = localDe(it.inicio), z = localDe(it.fim)
  const dia = (d: string) => `${DIAS_LONGOS[diaDaSemana(d)]}, ${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]}`
  if (it.diaInteiro) {
    const u = ultimoDia(it)
    return u === a.dia ? dia(a.dia) : `${dia(a.dia)} – ${dia(u)}`
  }
  if (a.dia === z.dia) return `${dia(a.dia)} · ${a.hora} – ${z.hora}`
  return `${dia(a.dia)}, ${a.hora} – ${dia(z.dia)}, ${z.hora}`
}

/** "9h", "9:30", como o Google escreve a hora no cartão. */
export const horaCurta = (hora: string) => (hora.endsWith(':00') ? `${Number(hora.slice(0, 2))}h` : `${Number(hora.slice(0, 2))}:${hora.slice(3, 5)}`)
export { hhmm as fmtHHMM }
