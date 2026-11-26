// FILA no servidor (24/11/2026): a mesma conta da tela da Fila (ordem manual + prazo,
// capacidade 4,5 h/dia, pula fim de semana e feriado), para várias pessoas numa consulta.
// Usada pela carga da Equipe (/api/trabalho/carga) e pelo lembrete do dia (/api/trabalho/hoje).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { feriadosNacionais, feriadosExtras } from '@/lib/assistente/horario'
import { hojeSP } from './cronograma-server'
import { CAPACIDADE_PADRAO, diasUteisEntre, ehDiaUtil, itemDoTicket, ordenarFila, planejarFila, sextaDaSemana, type Previsao } from './fila'
import { planoDeHoras } from './estimativa'
import { medianasPorCategoria, type Mediana } from './sugestao-categoria-server'
import { notificarTicket } from '@/lib/tickets/server'
import type { Ticket } from '@/lib/tickets/constantes'

/** Sem estimativa de ninguém: a previsão usa a MEDIANA da categoria (5+ amostras) em vez de um dia
 *  inteiro (melhorias 2.1). O item continua marcado como sem estimativa (aparece "~"). */
function comSugestao<T extends { semEstimativa: boolean; dias: number; horasDia: number; continuo?: boolean }>(i: T, categoria: string | null | undefined, med: Map<string, Mediana>): T & { sugerido: number | null } {
  const m = i.semEstimativa && !i.continuo ? med.get((categoria || '').trim()) : undefined
  if (!m) return { ...i, sugerido: null }
  const p = planoDeHoras(m.horas, CAPACIDADE_PADRAO)
  return { ...i, dias: p.dias, horasDia: p.horasDia, sugerido: m.horas }
}

/** Mesmo filtro da /api/trabalho/fila: resolvido já foi feito; compras e reunião não entram. */
const FORA = '(resolvido,fechado,cancelado)'

export interface ItemResumo {
  id: string; numero: number; titulo: string; prazo: string | null; horas: number; inicio: string; fim: string
  atrasado: boolean; urgente: boolean; semEstimativa: boolean; continuo: boolean; visibilidade: string; solicitante_id: string
  status: string
  /** Dias sem movimento (updated_at). */
  parado: number
  /** Prazo impossível (melhorias 2.2): a fila só começa DEPOIS do prazo, ou venceu sem nem começar. */
  impossivel?: boolean
  /** Bola parada (melhorias 3.2): dias úteis sem nenhum evento de quem faz, quando passou do limite
   *  (urgente 1, normal 5). null = está andando. */
  bola?: { dias: number; limite: number } | null
  /** Horas que a mediana da categoria sugeriu (item sem estimativa); null = usou o dia inteiro. */
  sugerido?: number | null
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
  /** Quantos itens estão com a bola parada (a Equipe mostra só este número). */
  bolasParadas: number
}

/** Bola parada (melhorias 3.2): N dias úteis sem evento de quem faz. Não existe prioridade "baixa"
 *  no portal; quando existir, entra aqui com 10. */
export const LIMITE_BOLA = { urgente: 1, normal: 5 } as const
/** Mais que isso não importa (a borda já está no máximo) — e limita a consulta de eventos. */
const JANELA_BOLA = 30

/** Último evento de CADA responsável nos seus tickets (até 30 dias atrás), em lotes por causa do tamanho da URL. */
async function ultimoEventoDoResponsavel(tks: { id: string; responsavel_id: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const dono = new Map(tks.map((t) => [t.id, t.responsavel_id]))
  const desde = new Date(Date.now() - JANELA_BOLA * 86400000).toISOString()
  const ids = tks.map((t) => t.id)
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += 150) lotes.push(ids.slice(i, i + 150))
  const resp = await Promise.all(lotes.map((l) => supabaseAdmin.from('tickets_eventos').select('ticket_id, autor_id, created_at')
    .in('ticket_id', l).gte('created_at', desde).order('created_at', { ascending: false }).limit(5000)))
  for (const r of resp) for (const e of (r.data || []) as { ticket_id: string; autor_id: string | null; created_at: string }[]) {
    if (e.autor_id !== dono.get(e.ticket_id)) continue
    if (!out.has(e.ticket_id) || out.get(e.ticket_id)! < e.created_at) out.set(e.ticket_id, e.created_at)
  }
  return out
}

/** Dias úteis desde a data (0 = hoje). */
function diasUteisDesde(iso: string, hoje: string, feriados: Set<string>): number {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  if (d >= hoje) return 0
  // diasUteisEntre conta os dois lados; o dia do evento não conta como "parado".
  return Math.max(0, diasUteisEntre(d, hoje, feriados) - (ehDiaUtil(d, feriados) ? 1 : 0))
}

export function feriadosDoAno(hoje: string): Set<string> {
  const ano = Number(hoje.slice(0, 4))
  return new Set([...feriadosNacionais(ano), ...feriadosNacionais(ano + 1), ...feriadosExtras()])
}

type Tk = { id: string; numero: number; titulo: string; prazo: string | null; payload: unknown; responsavel_id: string; aceite?: string | null; visibilidade: string; solicitante_id: string
  status: string; quadro_id: string | null; updated_at: string; created_at: string; aceite_em?: string | null; categoria?: string | null }

/** Resumo da fila de cada pessoa pedida (quem não tem nada volta com a fila vazia). */
export async function resumoDasFilas(userIds: string[], opc: { detalhes?: boolean; semBola?: boolean } = {}): Promise<Map<string, ResumoFila>> {
  const hoje = hojeSP()
  const sexta = sextaDaSemana(hoje)
  const feriados = feriadosDoAno(hoje)
  const out = new Map<string, ResumoFila>()
  if (!userIds.length) return out
  // Lentidão (26/11/2026): medianas, tickets e plano vão juntos (antes as medianas iam primeiro, sozinhas).
  const [med, tks, plano] = await Promise.all([
    medianasPorCategoria().catch(() => new Map<string, Mediana>()),
    supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, payload, responsavel_id, aceite, aceite_em, visibilidade, solicitante_id, status, quadro_id, updated_at, created_at, categoria')
      .in('responsavel_id', userIds).not('tipo', 'in', '(compras,reuniao)').not('status', 'in', FORA).limit(3000),
    supabaseAdmin.from('tickets_plano').select('ticket_id, posicao, user_id').in('user_id', userIds),
  ])
  // Bola parada: só o que está com quem faz (aceito e não esperando terceiro).
  const comBola = ((tks.data || []) as Tk[]).filter((t) => t.aceite !== 'pendente' && !t.status.startsWith('aguardando'))
  const comBolaIds = new Set(opc.semBola ? [] : comBola.map((t) => t.id))
  const porPessoa = new Map<string, Tk[]>()
  for (const t of (tks.data || []) as Tk[]) porPessoa.set(t.responsavel_id, [...(porPessoa.get(t.responsavel_id) || []), t])
  // "De quem é": nome de quem pediu e o quadro (só quando pedem detalhes — a carga da Equipe não precisa).
  const nomes = new Map<string, string>(), quadros = new Map<string, { nome: string; cor: string }>()
  const lista = (tks.data || []) as Tk[]
  const uids = opc.detalhes ? [...new Set(lista.map((t) => t.solicitante_id))] : []
  const qids = opc.detalhes ? [...new Set(lista.map((t) => t.quadro_id).filter((x): x is string => !!x))] : []
  // Eventos da bola parada e nomes/quadros também vão juntos (antes: um depois do outro).
  const [ultimo, us, qs] = await Promise.all([
    // semBola: quem só precisa das datas (previsão, negociação) não paga a consulta dos eventos.
    opc.semBola ? Promise.resolve(new Map<string, string>()) : ultimoEventoDoResponsavel(comBola).catch(() => new Map<string, string>()),
    uids.length ? supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', uids) : Promise.resolve({ data: [] }),
    qids.length ? supabaseAdmin.from('tickets_quadros').select('id, nome, cor').in('id', qids) : Promise.resolve({ data: [] }),
  ])
  for (const u of (us.data || []) as { id: string; nome: string }[]) nomes.set(u.id, u.nome)
  for (const q of (qs.data || []) as { id: string; nome: string; cor: string }[]) quadros.set(q.id, { nome: q.nome, cor: q.cor })
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
    const itens = ordenarFila(lista.map((t) => comSugestao(itemDoTicket(t, CAPACIDADE_PADRAO, feriados), t.categoria, med)), posDe.get(uid) || new Map())
    const aloc = new Map<string, { id: string; horas: number }[]>()
    const prev = planejarFila(itens, hoje, feriados, CAPACIDADE_PADRAO, aloc)
    const comFim = itens.filter((i) => !i.continuo)
    const res = (i: (typeof itens)[number], p: Previsao): ItemResumo => {
      const t = porId.get(i.id)!
      return { id: i.id, numero: i.numero, titulo: t.titulo, prazo: i.prazo, horas: p.horas, inicio: p.inicio, fim: p.fim,
        atrasado: !!i.prazo && i.prazo < hoje, urgente: i.urgente, semEstimativa: i.semEstimativa, continuo: !!i.continuo, sugerido: i.sugerido,
        impossivel: !!i.prazo && !i.continuo && (p.inicio > i.prazo || (i.prazo < hoje && t.status === 'aberto')),
        visibilidade: t.visibilidade, solicitante_id: t.solicitante_id, status: t.status,
        bola: (() => {
          if (i.continuo || !comBolaIds.has(t.id)) return null
          const limite = i.urgente ? LIMITE_BOLA.urgente : LIMITE_BOLA.normal
          // Sem evento de quem faz nos últimos 30 dias: conta desde que a bola chegou (aceite ou criação).
          const desde = ultimo.get(t.id) || t.aceite_em || t.created_at
          const dias = Math.min(JANELA_BOLA, diasUteisDesde(desde, hoje, feriados))
          return dias >= limite ? { dias, limite } : null
        })(),
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
      bolasParadas: [...hojeL, ...semana, ...listaDepois].filter((x) => x.bola).length,
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

export interface Previsto { inicio: string; fim: string; naFrente: number
  /** Só com urgente (melhorias 3.1): quantos pedidos da fila ficam para depois dele. */
  empurra?: number }

/** A fila da pessoa hoje, na ordem, SEM o ticket indicado (para encaixá-lo depois). */
async function filaAtual(userId: string, semTicket: string | null) {
  const hoje = hojeSP()
  const feriados = feriadosDoAno(hoje)
  const [tks, plano] = await Promise.all([
    supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, payload, aceite, categoria').eq('responsavel_id', userId)
      .not('tipo', 'in', '(compras,reuniao)').not('status', 'in', FORA).limit(1000),
    supabaseAdmin.from('tickets_plano').select('ticket_id, posicao').eq('user_id', userId),
  ])
  const pos = new Map(((plano.data || []) as { ticket_id: string; posicao: number }[]).map((p) => [p.ticket_id, p.posicao]))
  const todos = (tks.data || []) as { id: string; numero: number; prazo: string | null; payload: unknown; aceite?: string | null; categoria?: string | null }[]
  const med = await medianasPorCategoria().catch(() => new Map<string, Mediana>())
  const alvo = semTicket ? todos.find((t) => t.id === semTicket) || null : null
  const itens = ordenarFila(todos.filter((t) => t.aceite !== 'pendente' && t.id !== semTicket).map((t) => comSugestao(itemDoTicket(t, CAPACIDADE_PADRAO, feriados), t.categoria, med)), pos)
  return { hoje, feriados, itens, pos, alvo }
}

/**
 * "Se este trabalho tiver X horas, começa e termina quando?" (24/11/2026). Pedido novo ou ainda
 * sem lugar na fila entra NO FIM (José: "vai para o fim da fila e soma as horas"); ticket que já
 * tem lugar (ordem manual) fica onde está. ticketId null = pedido que ainda vai ser criado.
 */
export async function previsoesDoTicket(userId: string, ticketId: string | null, totais: number[], opc: { urgente?: boolean } = {}): Promise<Record<string, Previsto>> {
  const { hoje, feriados, itens, pos, alvo } = await filaAtual(userId, ticketId)
  const jaTemLugar = !!ticketId && pos.has(ticketId)
  const out: Record<string, Previsto> = {}
  for (const total of totais) {
    const { dias, horasDia } = planoDeHoras(total, CAPACIDADE_PADRAO)
    const base = alvo ? itemDoTicket(alvo, CAPACIDADE_PADRAO, feriados) : { id: '__novo', numero: 0, prazo: null, urgente: false, dias: 1, horasDia: 1 }
    const novo = { ...base, id: ticketId || '__novo', dias, horasDia, continuo: false, ...(opc.urgente ? { urgente: true } : {}) }
    // No fim: todo mundo na ordem de agora (0..n-1) e o novo depois. Já com lugar: ordem normal.
    const ordem = jaTemLugar
      ? ordenarFila([...itens, novo], pos)
      : ordenarFila([...itens, novo], new Map([...itens.map((i, k) => [i.id, k] as [string, number]), [novo.id, itens.length]]))
    const p = planejarFila(ordem, hoje, feriados, CAPACIDADE_PADRAO).get(novo.id)
    const semRotina = ordem.filter((i) => !i.continuo)
    const lugar = semRotina.findIndex((i) => i.id === novo.id)
    out[String(total)] = { inicio: p?.inicio || '', fim: p?.fim || '', naFrente: lugar,
      // Urgente fura a fila: tudo que não é urgente fica depois dele.
      ...(opc.urgente ? { empurra: semRotina.slice(lugar + 1).filter((i) => !i.urgente).length } : {}) }
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

/** "Fazer agora" (Faxina, melhorias 1.2): o pedido vai para o TOPO da fila de quem faz (depois dos urgentes). */
export async function colocarNoTopoDaFila(userId: string, ticketId: string): Promise<void> {
  const { itens } = await filaAtual(userId, ticketId)
  const agora = new Date().toISOString()
  const ordem = [ticketId, ...itens.map((i) => i.id)]
  await supabaseAdmin.from('tickets_plano')
    .upsert(ordem.map((ticket_id, posicao) => ({ user_id: userId, ticket_id, posicao, updated_at: agora })), { onConflict: 'user_id,ticket_id' })
}

/**
 * Pedido URGENTE entrou na fila de alguém (melhorias 3.1): avisa quem pediu os pedidos que ficaram
 * para depois dele. Um aviso por pessoa, sem dizer o título do urgente (privacidade).
 */
export async function avisarEmpurrados(userId: string, urgenteId: string, autorId: string, nomeQuemFaz: string): Promise<number> {
  const { data } = await supabaseAdmin.from('tickets').select('id, numero, titulo, solicitante_id, payload, aceite')
    .eq('responsavel_id', userId).neq('id', urgenteId).not('tipo', 'in', '(compras,reuniao)').not('status', 'in', FORA).limit(500)
  const porQuem = new Map<string, { id: string; numero: number }[]>()
  for (const t of (data || []) as { id: string; numero: number; solicitante_id: string; payload: { urgente?: boolean; prazo_indeterminado?: boolean } | null; aceite?: string | null }[]) {
    if (t.payload?.urgente || t.aceite === 'pendente' || t.solicitante_id === userId || t.solicitante_id === autorId) continue
    porQuem.set(t.solicitante_id, [...(porQuem.get(t.solicitante_id) || []), { id: t.id, numero: t.numero }])
  }
  for (const [quem, lista] of porQuem) {
    const nums = lista.slice(0, 5).map((x) => '#' + x.numero).join(', ') + (lista.length > 5 ? '…' : '')
    await notificarTicket({ id: lista[0].id } as Ticket, [quem], autorId,
      'Um pedido urgente entrou na fila de ' + nomeQuemFaz.split(' ')[0],
      (lista.length > 1 ? 'Seus pedidos ' + nums + ' podem' : 'Seu pedido ' + nums + ' pode') + ' atrasar um pouco.')
  }
  return porQuem.size
}

export interface Negociacao { id: string; numero: number; titulo: string; prazo: string; comeca: string; termina: string; com: string; prioridade: string | null }

/**
 * Pedidos que EU fiz e cujo prazo ficou impossível na fila de quem faz (melhorias 2.2): a fila só
 * começa depois do prazo, ou venceu sem começar. Quem pediu decide: aceitar a nova data, pedir
 * prioridade ou cancelar.
 */
export async function negociacoesDe(userId: string): Promise<Negociacao[]> {
  const { data } = await supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, responsavel_id, payload')
    .eq('solicitante_id', userId).neq('responsavel_id', userId).not('prazo', 'is', null)
    .not('tipo', 'in', '(compras,reuniao)').not('status', 'in', '(resolvido,fechado,cancelado)').limit(200)
  const pedidos = (data || []) as { id: string; numero: number; titulo: string; prazo: string; responsavel_id: string; payload: { prioridade?: { estado?: string } } | null }[]
  if (!pedidos.length) return []
  const quem = [...new Set(pedidos.map((p) => p.responsavel_id))]
  const [filas, us] = await Promise.all([
    resumoDasFilas(quem, { semBola: true }),
    supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', quem),
  ])
  const nome = new Map(((us.data || []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]))
  const out: Negociacao[] = []
  for (const p of pedidos) {
    const f = filas.get(p.responsavel_id)
    const i = f ? [...f.hoje, ...f.semana, ...f.listaDepois].find((x) => x.id === p.id) : undefined
    if (!i?.impossivel) continue
    out.push({ id: p.id, numero: p.numero, titulo: p.titulo, prazo: p.prazo, comeca: i.inicio, termina: i.fim, com: nome.get(p.responsavel_id) || 'Alguém', prioridade: p.payload?.prioridade?.estado || null })
  }
  return out
}

/** Pedidos de prioridade esperando EU (quem faz) responder. */
export async function prioridadesPendentes(userId: string): Promise<{ id: string; numero: number; titulo: string; por: string; motivo: string | null }[]> {
  const { data } = await supabaseAdmin.from('tickets').select('id, numero, titulo, payload')
    .eq('responsavel_id', userId).eq('payload->prioridade->>estado', 'pedida')
    .not('status', 'in', '(resolvido,fechado,cancelado)').limit(50)
  const lista = (data || []) as { id: string; numero: number; titulo: string; payload: { prioridade?: { por?: string; motivo?: string } } | null }[]
  const ids = [...new Set(lista.map((t) => t.payload?.prioridade?.por).filter((x): x is string => !!x))]
  const { data: us } = ids.length ? await supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', ids) : { data: [] }
  const nome = new Map(((us || []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]))
  return lista.map((t) => ({ id: t.id, numero: t.numero, titulo: t.titulo, por: nome.get(t.payload?.prioridade?.por || '') || 'Alguém', motivo: t.payload?.prioridade?.motivo || null }))
}
