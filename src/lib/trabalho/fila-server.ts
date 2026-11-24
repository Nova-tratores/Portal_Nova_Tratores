// FILA no servidor (24/11/2026): a mesma conta da tela da Fila (ordem manual + prazo,
// capacidade 4,5 h/dia, pula fim de semana e feriado), para várias pessoas numa consulta.
// Usada pela carga da Equipe (/api/trabalho/carga) e pelo lembrete do dia (/api/trabalho/hoje).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { feriadosNacionais, feriadosExtras } from '@/lib/assistente/horario'
import { hojeSP } from './cronograma-server'
import { CAPACIDADE_PADRAO, ehDiaUtil, itemDoTicket, ordenarFila, planejarFila, sextaDaSemana, type Previsao } from './fila'
import { planoDeHoras } from './estimativa'

/** Mesmo filtro da /api/trabalho/fila: resolvido já foi feito; compras e reunião não entram. */
const FORA = '(resolvido,fechado,cancelado)'

export interface ItemResumo {
  id: string; numero: number; titulo: string; prazo: string | null; horas: number; inicio: string; fim: string
  atrasado: boolean; urgente: boolean; semEstimativa: boolean; continuo: boolean; visibilidade: string; solicitante_id: string
  status: string
  /** Dias sem movimento (updated_at). */
  parado: number
  /** Só com { detalhes: true }: quem pediu (null = a própria pessoa) e o quadro. */
  pedidoPor?: string | null
  quadro?: { nome: string; cor: string } | null
}
export interface ResumoFila {
  /** O que a fila põe para HOJE, na ordem (objetivo do dia). */
  hoje: ItemResumo[]
  /** O que começa até sexta (objetivo da semana), sem os de hoje. */
  semana: ItemResumo[]
  depois: number
  continuos: number
  /** A fila COMPLETA: o que vem depois desta semana e os contínuos (na rotina). */
  listaDepois: ItemResumo[]
  listaContinuos: ItemResumo[]
  /** Pedidos que chegaram e a pessoa ainda não aceitou. */
  aceitar: number
  total: number
  horas: number
  atrasados: number
  /** Último dia ocupado pelo que tem prazo ('' = fila vazia). */
  livreEm: string
  /** Ids na ordem da fila inteira (o PUT /api/trabalho/fila precisa da lista toda para reordenar). */
  ordem: string[]
  /** Plano dos próximos 10 dias úteis: quanto de cada item cai em cada dia (desenho da semana). */
  plano: { dia: string; itens: { id: string; horas: number }[] }[]
}

export function feriadosDoAno(hoje: string): Set<string> {
  const ano = Number(hoje.slice(0, 4))
  return new Set([...feriadosNacionais(ano), ...feriadosNacionais(ano + 1), ...feriadosExtras()])
}

type Tk = { id: string; numero: number; titulo: string; prazo: string | null; payload: unknown; responsavel_id: string; aceite?: string | null; visibilidade: string; solicitante_id: string
  status: string; quadro_id: string | null; updated_at: string }

/** Resumo da fila de cada pessoa pedida (quem não tem nada volta com a fila vazia). */
export async function resumoDasFilas(userIds: string[], opc: { detalhes?: boolean } = {}): Promise<Map<string, ResumoFila>> {
  const hoje = hojeSP()
  const sexta = sextaDaSemana(hoje)
  const feriados = feriadosDoAno(hoje)
  const out = new Map<string, ResumoFila>()
  if (!userIds.length) return out
  const [tks, plano] = await Promise.all([
    supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, payload, responsavel_id, aceite, visibilidade, solicitante_id, status, quadro_id, updated_at')
      .in('responsavel_id', userIds).not('tipo', 'in', '(compras,reuniao)').not('status', 'in', FORA).limit(3000),
    supabaseAdmin.from('tickets_plano').select('ticket_id, posicao, user_id').in('user_id', userIds),
  ])
  const porPessoa = new Map<string, Tk[]>()
  for (const t of (tks.data || []) as Tk[]) porPessoa.set(t.responsavel_id, [...(porPessoa.get(t.responsavel_id) || []), t])
  // "De quem é": nome de quem pediu e o quadro (só quando pedem detalhes — a carga da Equipe não precisa).
  const nomes = new Map<string, string>(), quadros = new Map<string, { nome: string; cor: string }>()
  if (opc.detalhes) {
    const lista = (tks.data || []) as Tk[]
    const uids = [...new Set(lista.map((t) => t.solicitante_id))]
    const qids = [...new Set(lista.map((t) => t.quadro_id).filter((x): x is string => !!x))]
    const [us, qs] = await Promise.all([
      uids.length ? supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', uids) : Promise.resolve({ data: [] }),
      qids.length ? supabaseAdmin.from('tickets_quadros').select('id, nome, cor').in('id', qids) : Promise.resolve({ data: [] }),
    ])
    for (const u of (us.data || []) as { id: string; nome: string }[]) nomes.set(u.id, u.nome)
    for (const q of (qs.data || []) as { id: string; nome: string; cor: string }[]) quadros.set(q.id, { nome: q.nome, cor: q.cor })
  }
  const agoraMs = Date.now()
  const posDe = new Map<string, Map<string, number>>()
  for (const p of (plano.data || []) as { ticket_id: string; posicao: number; user_id: string }[]) {
    if (!posDe.has(p.user_id)) posDe.set(p.user_id, new Map())
    posDe.get(p.user_id)!.set(p.ticket_id, p.posicao)
  }

  for (const uid of userIds) {
    const todos = porPessoa.get(uid) || []
    const aceitar = todos.filter((t) => t.aceite === 'pendente').length
    // Pedido ainda não aceito não é trabalho da fila (fica em "Chegou pra você").
    const lista = todos.filter((t) => t.aceite !== 'pendente')
    const porId = new Map(lista.map((t) => [t.id, t]))
    const itens = ordenarFila(lista.map((t) => itemDoTicket(t, CAPACIDADE_PADRAO, feriados)), posDe.get(uid) || new Map())
    const aloc = new Map<string, { id: string; horas: number }[]>()
    const prev = planejarFila(itens, hoje, feriados, CAPACIDADE_PADRAO, aloc)
    const comFim = itens.filter((i) => !i.continuo)
    const res = (i: (typeof itens)[number], p: Previsao): ItemResumo => {
      const t = porId.get(i.id)!
      return { id: i.id, numero: i.numero, titulo: t.titulo, prazo: i.prazo, horas: p.horas, inicio: p.inicio, fim: p.fim,
        atrasado: !!i.prazo && i.prazo < hoje, urgente: i.urgente, semEstimativa: i.semEstimativa, continuo: !!i.continuo,
        visibilidade: t.visibilidade, solicitante_id: t.solicitante_id, status: t.status,
        parado: Math.max(0, Math.floor((agoraMs - Date.parse(t.updated_at)) / 86400000)),
        ...(opc.detalhes ? { pedidoPor: t.solicitante_id === uid ? null : nomes.get(t.solicitante_id) || 'Alguém', quadro: t.quadro_id ? quadros.get(t.quadro_id) || null : null } : {}) }
    }
    const hojeL: ItemResumo[] = [], semana: ItemResumo[] = [], listaDepois: ItemResumo[] = []
    for (const i of comFim) {
      const p = prev.get(i.id)!
      if (p.inicio <= hoje) hojeL.push(res(i, p))
      else if (p.inicio <= sexta) semana.push(res(i, p))
      else listaDepois.push(res(i, p))
    }
    const listaContinuos = itens.filter((i) => i.continuo).map((i) => res(i, prev.get(i.id)!))
    out.set(uid, {
      hoje: hojeL, semana, depois: listaDepois.length, continuos: listaContinuos.length, listaDepois, listaContinuos, aceitar,
      total: itens.length,
      horas: comFim.reduce((s, i) => s + (prev.get(i.id)?.horas || 0), 0),
      atrasados: itens.filter((i) => i.prazo && i.prazo < hoje).length,
      livreEm: comFim.map((i) => prev.get(i.id)?.fim || '').sort().pop() || '',
      ordem: itens.map((i) => i.id),
      plano: proximosDiasUteis(hoje, feriados, 10).map((dia) => ({ dia, itens: aloc.get(dia) || [] })),
    })
  }
  return out
}

/** Os próximos n dias úteis a partir de hoje (inclusive). */
export function proximosDiasUteis(hoje: string, feriados: Set<string>, n: number): string[] {
  const out: string[] = []
  for (let d = hoje, i = 0; out.length < n && i < 60; i++) {
    if (ehDiaUtil(d, feriados)) out.push(d)
    const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10)
  }
  return out
}

export interface Previsto { inicio: string; fim: string; naFrente: number }

/** A fila da pessoa hoje, na ordem, SEM o ticket indicado (para encaixá-lo depois). */
async function filaAtual(userId: string, semTicket: string | null) {
  const hoje = hojeSP()
  const feriados = feriadosDoAno(hoje)
  const [tks, plano] = await Promise.all([
    supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, payload, aceite').eq('responsavel_id', userId)
      .not('tipo', 'in', '(compras,reuniao)').not('status', 'in', FORA).limit(1000),
    supabaseAdmin.from('tickets_plano').select('ticket_id, posicao').eq('user_id', userId),
  ])
  const pos = new Map(((plano.data || []) as { ticket_id: string; posicao: number }[]).map((p) => [p.ticket_id, p.posicao]))
  const todos = (tks.data || []) as { id: string; numero: number; prazo: string | null; payload: unknown; aceite?: string | null }[]
  const alvo = semTicket ? todos.find((t) => t.id === semTicket) || null : null
  const itens = ordenarFila(todos.filter((t) => t.aceite !== 'pendente' && t.id !== semTicket).map((t) => itemDoTicket(t, CAPACIDADE_PADRAO, feriados)), pos)
  return { hoje, feriados, itens, pos, alvo }
}

/**
 * "Se este trabalho tiver X horas, começa e termina quando?" (24/11/2026). Pedido novo ou ainda
 * sem lugar na fila entra NO FIM (José: "vai para o fim da fila e soma as horas"); ticket que já
 * tem lugar (ordem manual) fica onde está. ticketId null = pedido que ainda vai ser criado.
 */
export async function previsoesDoTicket(userId: string, ticketId: string | null, totais: number[]): Promise<Record<string, Previsto>> {
  const { hoje, feriados, itens, pos, alvo } = await filaAtual(userId, ticketId)
  const jaTemLugar = !!ticketId && pos.has(ticketId)
  const out: Record<string, Previsto> = {}
  for (const total of totais) {
    const { dias, horasDia } = planoDeHoras(total, CAPACIDADE_PADRAO)
    const base = alvo ? itemDoTicket(alvo, CAPACIDADE_PADRAO, feriados) : { id: '__novo', numero: 0, prazo: null, urgente: false, dias: 1, horasDia: 1 }
    const novo = { ...base, id: ticketId || '__novo', dias, horasDia, continuo: false }
    // No fim: todo mundo na ordem de agora (0..n-1) e o novo depois. Já com lugar: ordem normal.
    const ordem = jaTemLugar
      ? ordenarFila([...itens, novo], pos)
      : ordenarFila([...itens, novo], new Map([...itens.map((i, k) => [i.id, k] as [string, number]), [novo.id, itens.length]]))
    const p = planejarFila(ordem, hoje, feriados, CAPACIDADE_PADRAO).get(novo.id)
    out[String(total)] = { inicio: p?.inicio || '', fim: p?.fim || '', naFrente: ordem.filter((i) => !i.continuo).findIndex((i) => i.id === novo.id) }
  }
  return out
}

/**
 * Pedido novo vai para o FIM da fila de quem faz (24/11/2026): grava a ordem de agora + ele no fim
 * (tickets_plano). Sem isso, a fila ordenava pelo prazo e o pedido podia furar a fila de quem faz.
 * Urgente continua no topo (regra da ordenarFila).
 */
export async function colocarNoFimDaFila(userId: string, ticketId: string): Promise<void> {
  const { itens } = await filaAtual(userId, ticketId)
  const agora = new Date().toISOString()
  const ordem = [...itens.map((i) => i.id), ticketId]
  await supabaseAdmin.from('tickets_plano')
    .upsert(ordem.map((ticket_id, posicao) => ({ user_id: userId, ticket_id, posicao, updated_at: agora })), { onConflict: 'user_id,ticket_id' })
}
