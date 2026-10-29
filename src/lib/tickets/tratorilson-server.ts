// Tratorilson organiza a semana de tickets (José, 29/10/2026) — casca do banco e da IA.
// Regras puras em tratorilson-organizar.ts; tabelas em sql/tratorilson-tickets.sql.
// Roda às 07:00 pelo agendador (tarefa 'tratorilson-tickets') e na hora para uma pessoa
// (respondeu a pergunta do popup ou clicou "organizar agora").
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { chamarIA } from '@/lib/assistente/ia'
import { carregarAgenda } from '@/lib/agenda/server'
import type { Autenticado } from '@/lib/auth/server'
import { registrarEvento } from './server'
import {
  aplicarResposta, diasDoPlano, entraNoPlano, lerRespostaIA, planejar, type Prioridade,
} from './tratorilson-organizar'

const FECHADOS = '(resolvido,fechado,cancelado)'
const faltaTabela = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /tickets_tratorilson/.test(e.message || ''))

export interface ConfigTratorilson { ligado: boolean; porDia: number; tabela: boolean }

export async function lerConfig(): Promise<ConfigTratorilson> {
  const { data, error } = await supabaseAdmin.from('tickets_tratorilson_config').select('ligado, por_dia').eq('id', 1).maybeSingle()
  if (error) return { ligado: false, porDia: 4, tabela: !faltaTabela(error) }
  return { ligado: !!data?.ligado, porDia: Number(data?.por_dia) || 4, tabela: true }
}

export async function gravarConfig(ligado: boolean, por: string | null): Promise<string | null> {
  const { error } = await supabaseAdmin.from('tickets_tratorilson_config')
    .upsert({ id: 1, ligado, atualizado_por: por, atualizado_em: new Date().toISOString() })
  return error ? (faltaTabela(error) ? 'Falta rodar o SQL sql/tratorilson-tickets.sql no Supabase.' : error.message) : null
}

export async function estaDesligadoPara(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('tickets_tratorilson_optout').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

export async function gravarOptout(userId: string, desligado: boolean): Promise<string | null> {
  const r = desligado
    ? await supabaseAdmin.from('tickets_tratorilson_optout').upsert({ user_id: userId })
    : await supabaseAdmin.from('tickets_tratorilson_optout').delete().eq('user_id', userId)
  return r.error ? (faltaTabela(r.error) ? 'Falta rodar o SQL sql/tratorilson-tickets.sql no Supabase.' : r.error.message) : null
}

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const SISTEMA: Autenticado = { userId: 'tratorilson', email: null, isAdmin: true, isDev: false, categoria: null, modulos: [] }

interface TicketRow { id: string; numero: number; titulo: string; descricao: string | null; prazo: string | null; responsavel_id: string; solicitante_id: string; created_at: string }
interface Marca { ticket_id: string; prioridade: number | null; origem: string; prazo_marcado: string | null }

const PROMPT = `Você é o Tratorilson, assistente da Nova Tratores (concessionária Mahindra). Vai ordenar os tickets de UMA pessoa
por prioridade para ela organizar a semana. Para cada ticket numerado responda "alta", "media" ou "baixa":
- alta: cliente parado ou esperando, dinheiro/faturamento, prazo legal, algo que trava outra pessoa;
- media: trabalho normal do dia a dia;
- baixa: melhoria, organização, "quando der".
Se dois ou mais tickets parecerem igualmente urgentes e você NÃO souber qual vem primeiro, liste os números em "duvida"
(só quando a dúvida for real; no máximo 4). Responda SÓ JSON: {"itens":[{"n":1,"prioridade":"alta"}],"duvida":[1,2]}`

async function prioridadesDaIA(lista: TicketRow[], nomeSolicitante: (id: string) => string) {
  const ids = lista.map((t) => t.id)
  const entrada = lista.map((t, i) =>
    `${i + 1}. #${t.numero} ${t.titulo}${t.descricao ? ` — ${t.descricao.replace(/\s+/g, ' ').slice(0, 280)}` : ''} (pedido por ${nomeSolicitante(t.solicitante_id)}, aberto em ${t.created_at.slice(0, 10)})`,
  ).join('\n')
  try {
    const r = await chamarIA({
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: entrada }],
      response_format: { type: 'json_object' }, temperature: 0.1,
    }) as { choices?: { message?: { content?: string } }[] }
    return { ...lerRespostaIA(r?.choices?.[0]?.message?.content || '', ids), ia: true }
  } catch (e) {
    console.warn('[tratorilson-tickets] IA falhou:', e instanceof Error ? e.message : e)
    return { ...lerRespostaIA('', ids), ia: false }
  }
}

export interface ResultadoOrganizar { pessoas: number; marcados: number; perguntas: number; pulado?: string }

/**
 * Organiza a semana. Sem `soUsuario`: todas as pessoas (respeita a chave geral e quem desligou).
 * Com `soUsuario`: só ela, na hora (a chave geral ainda precisa estar ligada).
 */
export async function organizarTickets(opts: { soUsuario?: string; reorganizar?: string[] } = {}): Promise<ResultadoOrganizar> {
  const cfg = await lerConfig()
  if (!cfg.tabela) return { pessoas: 0, marcados: 0, perguntas: 0, pulado: 'falta o SQL sql/tratorilson-tickets.sql' }
  if (!cfg.ligado) return { pessoas: 0, marcados: 0, perguntas: 0, pulado: 'desligado na Central de Trabalho' }

  const hoje = hojeSP()
  const dias = diasDoPlano(hoje)
  const ultimo = dias[dias.length - 1]

  let q = supabaseAdmin.from('tickets').select('id, numero, titulo, descricao, prazo, responsavel_id, solicitante_id, created_at')
    .eq('tipo', 'generico').not('status', 'in', FECHADOS).not('responsavel_id', 'is', null).limit(2000)
  if (opts.soUsuario) q = q.eq('responsavel_id', opts.soUsuario)
  const { data: tks, error } = await q
  if (error) throw new Error(error.message)
  const tickets = (tks || []) as TicketRow[]
  if (!tickets.length) return { pessoas: 0, marcados: 0, perguntas: 0 }

  const [{ data: outs }, { data: marcas }, { data: pends }, { data: usus }] = await Promise.all([
    supabaseAdmin.from('tickets_tratorilson_optout').select('user_id'),
    supabaseAdmin.from('tickets_tratorilson').select('ticket_id, prioridade, origem, prazo_marcado').in('ticket_id', tickets.map((t) => t.id)),
    supabaseAdmin.from('tickets_tratorilson_perguntas').select('user_id').eq('status', 'pendente'),
    supabaseAdmin.from('financeiro_usu').select('id, nome'),
  ])
  const desligados = new Set((outs || []).map((o) => String(o.user_id)))
  const marcaDe = new Map(((marcas || []) as Marca[]).map((m) => [m.ticket_id, m]))
  const comPergunta = new Set((pends || []).map((p) => String(p.user_id)))
  const nomes = new Map((usus || []).map((u) => [String(u.id), String(u.nome || '')]))
  const nome = (id: string) => nomes.get(id) || 'alguém'
  const reorganizar = new Set(opts.reorganizar || [])

  // carga de cada pessoa por dia: compromissos da agenda (reunião, sala, OS, Lousa…) + tickets com prazo
  const carga = new Map<string, Record<string, number>>()
  const somar = (u: string, d: string) => { const m = carga.get(u) || {}; m[d] = (m[d] || 0) + 1; carga.set(u, m) }
  try {
    const ag = await carregarAgenda(SISTEMA, hoje, ultimo, 'coletiva')
    for (const i of ag.itens) {
      if (i.fonte === 'ticket') continue
      const d = i.diaInteiro ? i.inicio.slice(0, 10) : new Date(i.inicio).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      for (const p of i.pessoas || []) somar(p, d)
    }
  } catch (e) { console.warn('[tratorilson-tickets] agenda não carregou — conta só os tickets', e) }

  const porPessoa = new Map<string, TicketRow[]>()
  for (const t of tickets) {
    const m = marcaDe.get(t.id)
    const entra = entraNoPlano({ prazo: t.prazo, prazoMarcado: m?.prazo_marcado || null }, hoje)
      || (reorganizar.has(t.id) && !!m?.prazo_marcado && (t.prazo || '').slice(0, 10) === m.prazo_marcado)
    if (!entra) { if (t.prazo) somar(t.responsavel_id, t.prazo.slice(0, 10)); continue }
    ;(porPessoa.get(t.responsavel_id) ?? porPessoa.set(t.responsavel_id, []).get(t.responsavel_id)!).push(t)
  }

  let marcados = 0, perguntas = 0, pessoas = 0
  for (const [userId, lista] of porPessoa) {
    if (desligados.has(userId)) continue
    pessoas++
    const prioridade: Record<string, Prioridade> = {}
    const semPrioridade = lista.filter((t) => !marcaDe.get(t.id)?.prioridade)
    for (const t of lista) { const p = marcaDe.get(t.id)?.prioridade; if (p) prioridade[t.id] = p as Prioridade }
    if (semPrioridade.length) {
      const r = await prioridadesDaIA(semPrioridade, nome)
      Object.assign(prioridade, r.prioridades)
      await supabaseAdmin.from('tickets_tratorilson').upsert(semPrioridade.map((t) => ({
        ticket_id: t.id, prioridade: r.prioridades[t.id], origem: r.ia ? 'ia' : 'padrao', atualizado_em: new Date().toISOString(),
      })))
      if (r.duvida.length && !comPergunta.has(userId)) {
        const { error: ep } = await supabaseAdmin.from('tickets_tratorilson_perguntas').insert({
          user_id: userId, pergunta: 'Estou organizando sua semana. Qual destes é mais urgente?', ticket_ids: r.duvida,
        })
        if (!ep) { perguntas++; comPergunta.add(userId) }
      }
    }
    const plano = planejar(lista.map((t) => ({ id: t.id, criadoEm: t.created_at, prioridade: prioridade[t.id] || 2 })), carga.get(userId) || {}, hoje, cfg.porDia)
    for (const m of plano) {
      const t = lista.find((x) => x.id === m.ticketId)!
      if ((t.prazo || '').slice(0, 10) === m.dia) continue
      const { error: eu } = await supabaseAdmin.from('tickets').update({ prazo: m.dia }).eq('id', t.id)
      if (eu) { console.warn('[tratorilson-tickets] não marcou', t.numero, eu.message); continue }
      await supabaseAdmin.from('tickets_tratorilson').upsert({ ticket_id: t.id, prioridade: m.prioridade, prazo_marcado: m.dia, atualizado_em: new Date().toISOString() })
      await registrarEvento(t.id, null, 'edicao', {
        campo: 'prazo', de: t.prazo, para: m.dia, por: 'Tratorilson',
        motivo: `Tratorilson organizou a semana (prioridade ${m.prioridade === 1 ? 'alta' : m.prioridade === 3 ? 'baixa' : 'média'})`,
      })
      marcados++
    }
  }
  return { pessoas, marcados, perguntas }
}

export interface PerguntaPendente { id: string; pergunta: string; tickets: { id: string; numero: number; titulo: string }[] }

export async function perguntasPendentes(userId: string): Promise<PerguntaPendente[]> {
  const { data, error } = await supabaseAdmin.from('tickets_tratorilson_perguntas').select('id, pergunta, ticket_ids')
    .eq('user_id', userId).eq('status', 'pendente').order('criado_em').limit(3)
  if (error || !data?.length) return []
  const ids = [...new Set(data.flatMap((p) => p.ticket_ids as string[]))]
  const { data: ts } = await supabaseAdmin.from('tickets').select('id, numero, titulo, status').in('id', ids)
  const abertos = new Map((ts || []).filter((t) => !['resolvido', 'fechado', 'cancelado'].includes(String(t.status))).map((t) => [String(t.id), t]))
  return data.map((p) => ({
    id: String(p.id), pergunta: String(p.pergunta),
    tickets: (p.ticket_ids as string[]).map((id) => abertos.get(id)).filter(Boolean).map((t) => ({ id: String(t!.id), numero: Number(t!.numero), titulo: String(t!.titulo) })),
  })).filter((p) => p.tickets.length >= 2)
}

/** A pessoa respondeu: grava a prioridade e reorganiza a semana dela na hora. `escolhido` null = "tanto faz". */
export async function responderPergunta(userId: string, perguntaId: string, escolhido: string | null): Promise<string | null> {
  const { data: p } = await supabaseAdmin.from('tickets_tratorilson_perguntas').select('id, user_id, ticket_ids, status').eq('id', perguntaId).maybeSingle()
  if (!p || p.user_id !== userId) return 'Pergunta não encontrada.'
  if (p.status !== 'pendente') return null
  const ids = p.ticket_ids as string[]
  if (escolhido && !ids.includes(escolhido)) return 'Opção inválida.'
  await supabaseAdmin.from('tickets_tratorilson_perguntas')
    .update({ status: escolhido ? 'respondida' : 'ignorada', resposta_ticket_id: escolhido, respondido_em: new Date().toISOString() }).eq('id', perguntaId)
  if (escolhido) {
    const prio = aplicarResposta(ids, escolhido)
    await supabaseAdmin.from('tickets_tratorilson').upsert(ids.map((id) => ({ ticket_id: id, prioridade: prio[id], origem: 'pessoa', atualizado_em: new Date().toISOString() })))
    await organizarTickets({ soUsuario: userId, reorganizar: ids }).catch((e) => console.warn('[tratorilson-tickets] reorganizar', e))
  }
  return null
}
