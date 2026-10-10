// REUNIÕES — regras PURAS (sem banco, sem React). Testes em __tests__/regras.test.ts.
//
// Reunião é um ticket (tipo='reuniao') com etapa própria em `reuniao_etapa`;
// o status genérico é só projeção (ETAPA_INFO[etapa].status), como na SC.
// Cada ação decidida é um ticket comum (tipo='generico') com origem_reuniao_id.
// Migration: sql/reunioes.sql.
import type { TicketStatus } from '@/lib/tickets/constantes'

// ---------------------------------------------------------------- etapas
export type ReuniaoEtapa = 'agendada' | 'pauta_fechada' | 'em_andamento' | 'ata_rascunho' | 'ata_publicada' | 'cancelada'

export const ETAPA_INFO: Record<ReuniaoEtapa, { label: string; cor: string; fundo: string; status: TicketStatus }> = {
  agendada:      { label: 'Agendada',       cor: '#2563eb', fundo: 'rgba(37,99,235,.12)',  status: 'aberto' },
  pauta_fechada: { label: 'Pauta fechada',  cor: '#0891b2', fundo: 'rgba(8,145,178,.12)',  status: 'aberto' },
  em_andamento:  { label: 'Em andamento',   cor: '#d97706', fundo: 'rgba(217,119,6,.12)',  status: 'em_andamento' },
  ata_rascunho:  { label: 'Ata em rascunho', cor: '#7c3aed', fundo: 'rgba(124,58,237,.12)', status: 'aguardando_interno' },
  ata_publicada: { label: 'Ata publicada',  cor: '#059669', fundo: 'rgba(5,150,105,.12)',  status: 'resolvido' },
  cancelada:     { label: 'Cancelada',      cor: '#dc2626', fundo: 'rgba(220,38,38,.12)',  status: 'cancelado' },
}

// agendada → pauta_fechada → em_andamento → ata_rascunho → ata_publicada;
// agendada|pauta_fechada → cancelada; agendada → em_andamento (sem corte formal).
export const TRANSICOES_ETAPA: Record<ReuniaoEtapa, ReuniaoEtapa[]> = {
  agendada:      ['pauta_fechada', 'em_andamento', 'cancelada'],
  pauta_fechada: ['em_andamento', 'cancelada'],
  em_andamento:  ['ata_rascunho'],
  ata_rascunho:  ['ata_publicada'],
  ata_publicada: [],
  cancelada:     [],
}

export function podeMoverEtapa(de: ReuniaoEtapa, para: ReuniaoEtapa): boolean {
  return (TRANSICOES_ETAPA[de] || []).includes(para)
}

export const ETAPAS_PAUTA: ReuniaoEtapa[] = ['agendada', 'pauta_fechada']
export const ETAPAS_ENCERRADAS: ReuniaoEtapa[] = ['ata_publicada', 'cancelada']

// ----------------------------------------------------------------- papéis
export type PapelReuniao = 'condutor' | 'secretario' | 'participante'

export interface Presenca { usuario_id: string; papel: PapelReuniao; presente: boolean | null }

export function papelDe(presencas: Presenca[], userId: string): PapelReuniao | null {
  return presencas.find((p) => p.usuario_id === userId)?.papel ?? null
}

/** Condutor, secretário ou admin conduzem (movem etapa, registram resultado, criam ação, publicam). */
export function podeConduzir(presencas: Presenca[], userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true
  const p = papelDe(presencas, userId)
  return p === 'condutor' || p === 'secretario'
}

/** R9: condutor ≠ secretário — avisa, não bloqueia. */
export function avisoMesmaPessoa(condutorId: string, secretarioId: string | null): string | null {
  return secretarioId && secretarioId === condutorId
    ? 'Condutor e secretário são a mesma pessoa — quem compila a ata não deveria ser quem cobra.'
    : null
}

// ------------------------------------------------------------------- corte
/** R6: a pauta fecha `corteHoras` antes do início. */
export function corteEm(reuniaoInicio: string, corteHoras: number): Date {
  return new Date(new Date(reuniaoInicio).getTime() - corteHoras * 3600_000)
}

export function corteFechado(reuniaoInicio: string, corteHoras: number, agora: Date): boolean {
  return agora.getTime() >= corteEm(reuniaoInicio, corteHoras).getTime()
}

/**
 * C11: o cron do GitHub atrasa; a etapa "pauta_fechada" é calculada NA LEITURA.
 * Reunião `agendada` cujo corte já passou conta como `pauta_fechada`.
 */
export function etapaEfetiva(etapa: ReuniaoEtapa, reuniaoInicio: string | null, corteHoras: number, agora: Date): ReuniaoEtapa {
  if (etapa === 'agendada' && reuniaoInicio && corteFechado(reuniaoInicio, corteHoras, agora)) return 'pauta_fechada'
  return etapa
}

// ------------------------------------------------------------------- itens
export type ItemTipo = 'decidir' | 'informar' | 'discutir'
export type ItemResultado = 'decidido' | 'adiado' | 'parking' | 'informado' | 'discutido'
export type ItemOrigem = 'manual' | 'pendencia_escalada' | 'parking_anterior' | 'adiado_anterior' | 'parking'

export interface ItemPauta {
  id: string
  reuniao_id: string
  ordem: number
  pergunta: string
  tipo: ItemTipo
  trazido_por: string
  tempo_min: number
  origem: ItemOrigem
  ticket_referencia_id: string | null
  item_origem_id: string | null
  urgente: boolean
  resultado: ItemResultado | null
  decisao_texto: string | null
  decisao_motivo: string | null
  notas: string | null
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export const ITEM_TIPO_INFO: Record<ItemTipo, { label: string; cor: string; fundo: string }> = {
  decidir:  { label: 'Decidir',  cor: '#dc2626', fundo: 'rgba(220,38,38,.12)' },
  informar: { label: 'Informar', cor: '#2563eb', fundo: 'rgba(37,99,235,.12)' },
  discutir: { label: 'Discutir', cor: '#d97706', fundo: 'rgba(217,119,6,.12)' },
}

export const PERGUNTA_MAX = 500
export const DECISAO_MAX = 2000

type Validacao<T> = { ok: true; campos: T } | { ok: false; erro: string }

export function validarItem(
  body: Record<string, unknown>,
  criando: boolean,
): Validacao<{ pergunta?: string; tipo?: ItemTipo; trazido_por?: string; tempo_min?: number; notas?: string | null }> {
  const campos: { pergunta?: string; tipo?: ItemTipo; trazido_por?: string; tempo_min?: number; notas?: string | null } = {}
  if (criando || body.pergunta !== undefined) {
    const p = String(body.pergunta ?? '').trim()
    if (!p) return { ok: false, erro: 'Escreva a pergunta que a reunião precisa responder.' }
    if (p.length > PERGUNTA_MAX) return { ok: false, erro: `A pergunta passou de ${PERGUNTA_MAX} caracteres.` }
    campos.pergunta = p
  }
  if (criando || body.tipo !== undefined) {
    const t = String(body.tipo ?? '')
    if (!ITEM_TIPO_INFO[t as ItemTipo]) return { ok: false, erro: 'Tipo do item: decidir, informar ou discutir.' }
    campos.tipo = t as ItemTipo
  }
  if (body.trazido_por !== undefined) {
    const u = String(body.trazido_por ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(u)) return { ok: false, erro: 'Quem traz o item: usuário inválido.' }
    campos.trazido_por = u
  }
  if (criando || body.tempo_min !== undefined) {
    const n = body.tempo_min === undefined ? 5 : Math.round(Number(body.tempo_min))
    if (!(n >= 1 && n <= 240)) return { ok: false, erro: 'Tempo previsto: de 1 a 240 minutos.' }
    campos.tempo_min = n
  }
  if (body.notas !== undefined) {
    const n = String(body.notas ?? '').trim()
    if (n.length > 4000) return { ok: false, erro: 'Notas: no máximo 4000 caracteres.' }
    campos.notas = n || null
  }
  return { ok: true, campos }
}

/** R7: resultados possíveis por tipo. `decidir` fecha só com decidido/adiado/parking. */
export const RESULTADOS_POR_TIPO: Record<ItemTipo, ItemResultado[]> = {
  decidir:  ['decidido', 'adiado', 'parking'],
  informar: ['informado', 'adiado', 'parking'],
  discutir: ['discutido', 'adiado', 'parking'],
}

export function validarResultado(
  tipo: ItemTipo,
  body: Record<string, unknown>,
): Validacao<{ resultado: ItemResultado; decisao_texto: string | null; decisao_motivo: string | null }> {
  const r = String(body.resultado ?? '') as ItemResultado
  if (!RESULTADOS_POR_TIPO[tipo].includes(r)) {
    return { ok: false, erro: `Resultado "${r || '—'}" não vale para um item de ${ITEM_TIPO_INFO[tipo].label.toLowerCase()}.` }
  }
  const texto = String(body.decisao_texto ?? '').trim() || null
  const motivo = String(body.decisao_motivo ?? '').trim() || null
  if (r === 'decidido') {
    if (!texto) return { ok: false, erro: 'Escreva o que foi decidido.' }
    if (!motivo) return { ok: false, erro: 'O motivo da decisão é obrigatório — é o que faz a ata valer daqui a seis meses.' }
  }
  if ((texto?.length || 0) > DECISAO_MAX || (motivo?.length || 0) > DECISAO_MAX) {
    return { ok: false, erro: `Decisão/motivo: no máximo ${DECISAO_MAX} caracteres.` }
  }
  return { ok: true, campos: { resultado: r, decisao_texto: r === 'decidido' ? texto : texto, decisao_motivo: r === 'decidido' ? motivo : motivo } }
}

export function somaTempo(itens: Pick<ItemPauta, 'tempo_min'>[]): number {
  return itens.reduce((s, i) => s + (i.tempo_min || 0), 0)
}

export function ordenarItens<T extends Pick<ItemPauta, 'ordem' | 'criado_em'>>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem || a.criado_em.localeCompare(b.criado_em))
}

/** Reordenação: devolve {id → ordem} para a lista recebida; ids que não estão na lista mantêm a ordem no fim. */
export function novaOrdem(idsNaOrdem: string[], existentes: Pick<ItemPauta, 'id' | 'ordem' | 'criado_em'>[]): Record<string, number> {
  const out: Record<string, number> = {}
  const vistos = new Set<string>()
  let n = 0
  for (const id of idsNaOrdem) if (existentes.some((e) => e.id === id) && !vistos.has(id)) { out[id] = n++; vistos.add(id) }
  for (const e of ordenarItens(existentes)) if (!vistos.has(e.id)) { out[e.id] = n++; vistos.add(e.id) }
  return out
}

// ------------------------------------------------------------- publicação
/** R7/R10: bloqueia publicar com item `decidir` sem resultado ou decidido sem motivo. */
export function validarPublicacao(itens: Pick<ItemPauta, 'tipo' | 'pergunta' | 'resultado' | 'decisao_texto' | 'decisao_motivo'>[]): string[] {
  const erros: string[] = []
  for (const i of itens) {
    if (i.tipo === 'decidir' && !i.resultado) erros.push(`"${i.pergunta}" ainda não tem resultado (decidido, adiado ou parking).`)
    if (i.resultado === 'decidido' && (!i.decisao_texto?.trim() || !i.decisao_motivo?.trim())) erros.push(`"${i.pergunta}" está como decidido sem decisão/motivo.`)
  }
  return erros
}

/** R13 + adiados: o que a próxima reunião da série recebe como sugestão. */
export function sugestoesProximaReuniao(itens: ItemPauta[]): Array<{ pergunta: string; tipo: ItemTipo; trazido_por: string; tempo_min: number; origem: ItemOrigem; item_origem_id: string }> {
  return ordenarItens(itens)
    .filter((i) => i.resultado === 'parking' || i.resultado === 'adiado')
    .map((i) => ({
      pergunta: i.pergunta, tipo: i.tipo, trazido_por: i.trazido_por, tempo_min: i.tempo_min,
      origem: i.resultado === 'adiado' ? 'adiado_anterior' : 'parking_anterior',
      item_origem_id: i.id,
    }))
}

// ------------------------------------------------------------ pendências
export interface AcaoDeReuniao {
  id: string
  numero: number
  titulo: string
  status: TicketStatus
  prazo: string | null          // YYYY-MM-DD
  responsavel_id: string
  origem_reuniao_id: string | null
  prazo_reprogramacoes: number
  resolvido_em: string | null
  fechado_em: string | null
  aceite?: string | null
}

export const LIMITE_REPROGRAMACOES = 2
export const PENDENCIAS_MINUTOS = 5

/** R4: com `>= 2` reprogramações, "novo prazo" não é mais saída. */
export function podeNovoPrazo(reprogramacoes: number): boolean {
  return reprogramacoes < LIMITE_REPROGRAMACOES
}

export interface Pendencia extends AcaoDeReuniao {
  dias_atraso: number
  bloqueada_novo_prazo: boolean
}

export interface BlocoPendencias {
  atrasadas: Pendencia[]
  vencendo: Pendencia[]
  concluidas: { n: number; titulos: string[] }
}

const ATIVOS: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_terceiro', 'aguardando_interno']

function diasEntre(deISO: string, ate: string): number {
  const a = new Date(deISO + 'T12:00:00Z').getTime()
  const b = new Date(ate + 'T12:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * R2: entram só ações ATRASADAS (prazo < hoje) ou VENCENDO (prazo ≤ limite:
 * dia da próxima reunião ou hoje+7). Em dia não aparece. Concluídas desde a
 * reunião anterior só contam. Ordem: atrasadas por dias de atraso (desc),
 * depois vencendo por prazo.
 */
export function classificarPendencias(
  acoes: AcaoDeReuniao[],
  opts: { hoje: string; limiteVencendo: string | null; desde: string | null },
): BlocoPendencias {
  const { hoje } = opts
  const limite = opts.limiteVencendo || addDias(hoje, 7)
  const atrasadas: Pendencia[] = []
  const vencendo: Pendencia[] = []
  const concluidas: string[] = []
  for (const a of acoes) {
    if (a.status === 'resolvido' || a.status === 'fechado') {
      const quando = a.resolvido_em || a.fechado_em
      if (!opts.desde || !quando || quando >= opts.desde) concluidas.push(a.titulo)
      continue
    }
    if (!ATIVOS.includes(a.status) || !a.prazo) continue
    const p: Pendencia = { ...a, dias_atraso: Math.max(0, diasEntre(a.prazo, hoje)), bloqueada_novo_prazo: !podeNovoPrazo(a.prazo_reprogramacoes) }
    if (a.prazo < hoje) atrasadas.push(p)
    else if (a.prazo <= limite) vencendo.push(p)
  }
  atrasadas.sort((x, y) => y.dias_atraso - x.dias_atraso || x.numero - y.numero)
  vencendo.sort((x, y) => (x.prazo! < y.prazo! ? -1 : x.prazo! > y.prazo! ? 1 : x.numero - y.numero))
  return { atrasadas, vencendo, concluidas: { n: concluidas.length, titulos: concluidas } }
}

export type SaidaPendencia = 'novo_prazo' | 'reatribuir' | 'escalar' | 'cancelar'
export const SAIDAS_PENDENCIA: SaidaPendencia[] = ['novo_prazo', 'reatribuir', 'escalar', 'cancelar']

/** R3/R4: qual saída vale para a pendência. Devolve mensagem de erro ou null. */
export function validarSaida(saida: string, acao: Pick<AcaoDeReuniao, 'prazo_reprogramacoes' | 'status'>): string | null {
  if (!SAIDAS_PENDENCIA.includes(saida as SaidaPendencia)) return 'Saída inválida: novo prazo, reatribuir, escalar ou cancelar.'
  if (!ATIVOS.includes(acao.status)) return 'Essa ação já foi encerrada.'
  if (saida === 'novo_prazo' && !podeNovoPrazo(acao.prazo_reprogramacoes)) {
    return `Essa ação já foi reprogramada ${acao.prazo_reprogramacoes} vezes — vira item de pauta ou é escalada; não ganha prazo novo.`
  }
  return null
}

/** C4: só prazo mudado por edição/tratamento conta; a nova data proposta no ACEITE inicial não. */
export function contaReprogramacao(ticket: { origem_reuniao_id?: string | null }, viaAceite: boolean): boolean {
  return !!ticket.origem_reuniao_id && !viaAceite
}

// --------------------------------------------------------------- séries
export type Recorrencia = 'nenhuma' | 'semanal' | 'quinzenal' | 'mensal'

export interface Serie {
  id: string
  nome: string
  condutor_id: string
  secretarios_rodizio: string[]
  participantes_padrao: string[]
  recorrencia: Recorrencia
  dia_semana: number | null
  hora: string | null           // HH:MM[:SS]
  duracao_min: number
  corte_antecedencia_horas: number
  visibilidade: 'privado' | 'publico'
  ativa: boolean
  instancias_geradas: number
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

const uuidOk = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export function validarSerie(body: Record<string, unknown>, criando: boolean): Validacao<Partial<Serie>> {
  const c: Partial<Serie> = {}
  if (criando || body.nome !== undefined) {
    const n = String(body.nome ?? '').trim()
    if (!n) return { ok: false, erro: 'Dê um nome à série (ex.: "Semanal Oficina").' }
    if (n.length > 120) return { ok: false, erro: 'Nome: no máximo 120 caracteres.' }
    c.nome = n
  }
  if (criando || body.condutor_id !== undefined) {
    if (!uuidOk(body.condutor_id)) return { ok: false, erro: 'Escolha o condutor.' }
    c.condutor_id = body.condutor_id as string
  }
  for (const k of ['secretarios_rodizio', 'participantes_padrao'] as const) {
    if (body[k] !== undefined) {
      if (!Array.isArray(body[k]) || !(body[k] as unknown[]).every(uuidOk)) return { ok: false, erro: `${k === 'secretarios_rodizio' ? 'Secretários' : 'Participantes'}: lista de usuários inválida.` }
      c[k] = [...new Set(body[k] as string[])]
    }
  }
  if (body.recorrencia !== undefined) {
    const r = String(body.recorrencia)
    if (!['nenhuma', 'semanal', 'quinzenal', 'mensal'].includes(r)) return { ok: false, erro: 'Recorrência: nenhuma, semanal, quinzenal ou mensal.' }
    c.recorrencia = r as Recorrencia
  }
  if (body.dia_semana !== undefined) {
    if (body.dia_semana === null || body.dia_semana === '') c.dia_semana = null
    else { const d = Number(body.dia_semana); if (!(Number.isInteger(d) && d >= 0 && d <= 6)) return { ok: false, erro: 'Dia da semana inválido.' }; c.dia_semana = d }
  }
  if (body.hora !== undefined) {
    if (body.hora === null || body.hora === '') c.hora = null
    else { const h = String(body.hora); if (!/^\d{2}:\d{2}(:\d{2})?$/.test(h)) return { ok: false, erro: 'Hora inválida (HH:MM).' }; c.hora = h.slice(0, 5) }
  }
  if (body.duracao_min !== undefined) { const n = Math.round(Number(body.duracao_min)); if (!(n >= 5 && n <= 480)) return { ok: false, erro: 'Duração: de 5 a 480 minutos.' }; c.duracao_min = n }
  if (body.corte_antecedencia_horas !== undefined) { const n = Math.round(Number(body.corte_antecedencia_horas)); if (!(n >= 0 && n <= 168)) return { ok: false, erro: 'Corte: de 0 a 168 horas.' }; c.corte_antecedencia_horas = n }
  if (body.visibilidade !== undefined) { if (body.visibilidade !== 'privado' && body.visibilidade !== 'publico') return { ok: false, erro: 'Visibilidade inválida.' }; c.visibilidade = body.visibilidade }
  if (body.ativa !== undefined) c.ativa = !!body.ativa
  const rec = c.recorrencia ?? (criando ? 'nenhuma' : undefined)
  if (rec && rec !== 'nenhuma') {
    const dia = c.dia_semana ?? (body.dia_semana === undefined ? undefined : null)
    const hora = c.hora ?? (body.hora === undefined ? undefined : null)
    if (criando && (dia == null || !hora)) return { ok: false, erro: 'Série recorrente precisa de dia da semana e hora.' }
  }
  return { ok: true, campos: c }
}

/** R9: rodízio — a instância N (1-based) usa o N-ésimo secretário, circular. */
export function secretarioDaVez(serie: Pick<Serie, 'secretarios_rodizio' | 'instancias_geradas'>): string | null {
  const lista = serie.secretarios_rodizio
  if (!lista.length) return null
  return lista[serie.instancias_geradas % lista.length]
}

export function addDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Próxima data (YYYY-MM-DD, no fuso de SP via `hojeSP`) da série depois de `apos`. */
export function proximaDataDaSerie(serie: Pick<Serie, 'recorrencia' | 'dia_semana'>, apos: string): string | null {
  if (serie.recorrencia === 'nenhuma' || serie.dia_semana == null) return null
  const passo = serie.recorrencia === 'semanal' ? 7 : serie.recorrencia === 'quinzenal' ? 14 : 28
  // Próximo dia_semana estritamente depois de `apos`.
  let d = addDias(apos, 1)
  for (let i = 0; i < 7; i++) {
    if (new Date(d + 'T12:00:00Z').getUTCDay() === serie.dia_semana) return d
    d = addDias(d, 1)
  }
  void passo
  return null
}

/** Monta o timestamptz de início (ISO) a partir de dia + hora, no fuso -03:00. */
export function inicioISO(dia: string, hora: string): string {
  return `${dia}T${hora.slice(0, 5)}:00-03:00`
}

// ------------------------------------------------------------- WhatsApp
export interface ResumoAta {
  serie: string | null
  titulo: string
  data: string                   // YYYY-MM-DD
  decididos: number
  acoes: Array<{ responsavel: string; titulo: string; prazo: string | null }>
  atrasadas: number
  link: string
}

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : 'sem prazo')

/** Texto curto (máx. 8 linhas): cabeçalho, contagens, até 4 ações, "e mais N", link. */
export function textoWhatsApp(r: ResumoAta): string {
  const linhas: string[] = []
  linhas.push(`📋 *${r.serie || r.titulo} — ${ddmm(r.data)}*`)
  linhas.push(`✅ Decidido: ${r.decididos} · 📌 Ações novas: ${r.acoes.length} · ⏰ Pendências atrasadas: ${r.atrasadas}`)
  const MAX = 4
  for (const a of r.acoes.slice(0, MAX)) linhas.push(`• ${a.responsavel.split(' ')[0]}: ${a.titulo} — até ${ddmm(a.prazo)}`)
  if (r.acoes.length > MAX) linhas.push(`• e mais ${r.acoes.length - MAX} no portal`)
  linhas.push(`Confirme suas ações no portal: ${r.link}`)
  return linhas.join('\n')
}

// -------------------------------------------------------- título/descrição
export function tituloReuniao(serieNome: string | null, dia: string, tituloLivre?: string | null): string {
  const t = (tituloLivre || '').trim()
  if (t) return t.slice(0, 200)
  return `${serieNome || 'Reunião'} — ${dia.split('-').reverse().join('/')}`
}
