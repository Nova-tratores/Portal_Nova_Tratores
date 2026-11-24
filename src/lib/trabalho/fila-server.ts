// FILA no servidor (24/11/2026): a mesma conta da tela da Fila (ordem manual + prazo,
// capacidade 4,5 h/dia, pula fim de semana e feriado), para várias pessoas numa consulta.
// Usada pela carga da Equipe (/api/trabalho/carga) e pelo lembrete do dia (/api/trabalho/hoje).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { feriadosNacionais, feriadosExtras } from '@/lib/assistente/horario'
import { hojeSP } from './cronograma-server'
import { CAPACIDADE_PADRAO, itemDoTicket, ordenarFila, planejarFila, sextaDaSemana, type Previsao } from './fila'

/** Mesmo filtro da /api/trabalho/fila: resolvido já foi feito; compras e reunião não entram. */
const FORA = '(resolvido,fechado,cancelado)'

export interface ItemResumo { id: string; numero: number; titulo: string; prazo: string | null; horas: number; inicio: string; fim: string; atrasado: boolean; urgente: boolean; semEstimativa: boolean; visibilidade: string; solicitante_id: string }
export interface ResumoFila {
  /** O que a fila põe para HOJE, na ordem (objetivo do dia). */
  hoje: ItemResumo[]
  /** O que começa até sexta (objetivo da semana), sem os de hoje. */
  semana: ItemResumo[]
  depois: number
  continuos: number
  /** Pedidos que chegaram e a pessoa ainda não aceitou. */
  aceitar: number
  total: number
  horas: number
  atrasados: number
  /** Último dia ocupado pelo que tem prazo ('' = fila vazia). */
  livreEm: string
}

export function feriadosDoAno(hoje: string): Set<string> {
  const ano = Number(hoje.slice(0, 4))
  return new Set([...feriadosNacionais(ano), ...feriadosNacionais(ano + 1), ...feriadosExtras()])
}

type Tk = { id: string; numero: number; titulo: string; prazo: string | null; payload: unknown; responsavel_id: string; aceite?: string | null; visibilidade: string; solicitante_id: string }

/** Resumo da fila de cada pessoa pedida (quem não tem nada volta com a fila vazia). */
export async function resumoDasFilas(userIds: string[]): Promise<Map<string, ResumoFila>> {
  const hoje = hojeSP()
  const sexta = sextaDaSemana(hoje)
  const feriados = feriadosDoAno(hoje)
  const out = new Map<string, ResumoFila>()
  if (!userIds.length) return out
  const [tks, plano] = await Promise.all([
    supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, payload, responsavel_id, aceite, visibilidade, solicitante_id')
      .in('responsavel_id', userIds).not('tipo', 'in', '(compras,reuniao)').not('status', 'in', FORA).limit(3000),
    supabaseAdmin.from('tickets_plano').select('ticket_id, posicao, user_id').in('user_id', userIds),
  ])
  const porPessoa = new Map<string, Tk[]>()
  for (const t of (tks.data || []) as Tk[]) porPessoa.set(t.responsavel_id, [...(porPessoa.get(t.responsavel_id) || []), t])
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
    const prev = planejarFila(itens, hoje, feriados, CAPACIDADE_PADRAO)
    const comFim = itens.filter((i) => !i.continuo)
    const res = (i: (typeof itens)[number], p: Previsao): ItemResumo => {
      const t = porId.get(i.id)!
      return { id: i.id, numero: i.numero, titulo: t.titulo, prazo: i.prazo, horas: p.horas, inicio: p.inicio, fim: p.fim,
        atrasado: !!i.prazo && i.prazo < hoje, urgente: i.urgente, semEstimativa: i.semEstimativa, visibilidade: t.visibilidade, solicitante_id: t.solicitante_id }
    }
    const hojeL: ItemResumo[] = [], semana: ItemResumo[] = []
    let depois = 0
    for (const i of comFim) {
      const p = prev.get(i.id)!
      if (p.inicio <= hoje) hojeL.push(res(i, p))
      else if (p.inicio <= sexta) semana.push(res(i, p))
      else depois++
    }
    out.set(uid, {
      hoje: hojeL, semana, depois, continuos: itens.length - comFim.length, aceitar,
      total: itens.length,
      horas: comFim.reduce((s, i) => s + (prev.get(i.id)?.horas || 0), 0),
      atrasados: itens.filter((i) => i.prazo && i.prazo < hoje).length,
      livreEm: comFim.map((i) => prev.get(i.id)?.fim || '').sort().pop() || '',
    })
  }
  return out
}
