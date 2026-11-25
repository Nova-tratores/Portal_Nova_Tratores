// PAINÉIS (melhorias 6, 25/11/2026) — SERVIDOR (service role).
//  · resumoDoDia(): o aviso das 17:30 de cada pessoa (tarefa 'central-resumo-dia' do agendador).
//  · painelFluxo(): os números da Visão geral (só admin, /api/trabalho/painel).
// Reunião e compras (SC) não entram em nenhuma conta de pedido, como no resto da Central.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { notificarTicket } from '@/lib/tickets/server'
import type { Ticket } from '@/lib/tickets/constantes'
import { carregarDiretorio } from '@/lib/agenda/server'
import { hojeSP } from './cronograma-server'
import { ehDiaUtil, diasUteisEntre } from './fila'
import { resumoDasFilas, feriadosDoAno } from './fila-server'
import { diaSPde, entrouSaiuPorSemana, idadeMedia, prazosCumpridos, segundaDe, textoResumoDia, type SemanaFluxo } from './painel'
import { horasPessoa } from '@/lib/reunioes/fila-reuniao'

const FORA_TIPOS = '(compras,reuniao)'
/** Marca o aviso de hoje (e evita mandar duas vezes se a tarefa rodar de novo). */
const LINK_RESUMO = '/fila?resumo=1'

// ------------------------------------------------------------------ 6.1 resumo de fim de dia
export async function resumoDoDia(): Promise<{ resumo?: string; pular?: string }> {
  const hoje = hojeSP()
  if (!ehDiaUtil(hoje, feriadosDoAno(hoje))) return { pular: 'hoje não é dia útil' }
  const inicio = `${hoje}T00:00:00-03:00`
  const dir = await carregarDiretorio()
  const ids = dir.pessoas.map((p) => p.id)
  if (!ids.length) return { pular: 'ninguém na agenda' }

  const [eventos, chegaram, filas, ja] = await Promise.all([
    supabaseAdmin.from('tickets_eventos').select('ticket_id, autor_id, tipo, payload').gte('created_at', inicio).in('tipo', ['status', 'transferencia']).limit(5000),
    supabaseAdmin.from('tickets').select('responsavel_id, solicitante_id').gte('created_at', inicio).not('tipo', 'in', FORA_TIPOS).limit(2000),
    resumoDasFilas(ids, { semBola: true }),
    supabaseAdmin.from('portal_notificacoes').select('user_id').eq('link', LINK_RESUMO).gte('created_at', inicio).limit(2000),
  ])
  // Status/transferência de reunião e SC não contam: só os tickets da fila.
  const tIds = [...new Set(((eventos.data || []) as { ticket_id: string }[]).map((e) => e.ticket_id))]
  const validos = new Set<string>()
  for (let i = 0; i < tIds.length; i += 150) {
    const { data } = await supabaseAdmin.from('tickets').select('id').in('id', tIds.slice(i, i + 150)).not('tipo', 'in', FORA_TIPOS)
    for (const t of (data || []) as { id: string }[]) validos.add(t.id)
  }
  const fechou = new Map<string, number>(), passou = new Map<string, number>(), chegou = new Map<string, number>()
  const mais = (m: Map<string, number>, k: string | null) => { if (k) m.set(k, (m.get(k) || 0) + 1) }
  for (const e of (eventos.data || []) as { ticket_id: string; autor_id: string | null; tipo: string; payload: { para?: string } | null }[]) {
    if (!validos.has(e.ticket_id)) continue
    if (e.tipo === 'status' && ['resolvido', 'fechado'].includes(String(e.payload?.para))) mais(fechou, e.autor_id)
    if (e.tipo === 'transferencia') mais(passou, e.autor_id)
  }
  for (const t of (chegaram.data || []) as { responsavel_id: string; solicitante_id: string }[]) if (t.responsavel_id !== t.solicitante_id) mais(chegou, t.responsavel_id)
  const avisados = new Set(((ja.data || []) as { user_id: string }[]).map((x) => x.user_id))

  let enviados = 0
  for (const uid of ids) {
    if (avisados.has(uid)) continue
    const f = filas.get(uid)
    const prox = f ? [...f.hoje, ...f.semana, ...f.listaDepois][0] : undefined
    const txt = textoResumoDia({ fechou: fechou.get(uid) || 0, passou: passou.get(uid) || 0, chegaram: chegou.get(uid) || 0, proximo: prox ? { numero: prox.numero, titulo: prox.titulo } : null })
    // Sem nada que aconteceu hoje, não manda (a fila sozinha não justifica um aviso por dia).
    if (!txt || (!fechou.get(uid) && !passou.get(uid) && !chegou.get(uid))) continue
    await notificarTicket({ id: '' } as Ticket, [uid], null, txt.titulo, txt.descricao, undefined, LINK_RESUMO)
    enviados++
  }
  return { resumo: `${enviados} resumo(s) enviados` }
}

// ------------------------------------------------------------------ 6.2 painel de fluxo
export interface PainelFluxo {
  semanas: SemanaFluxo[]
  abertos: number
  idadeMedia: number
  parados30: number
  gargalos: { nome: string; setor: string; semanas: number; itens: number }[]
  prazos: { pct: number | null; cumpridos: number; total: number }
  reuniaoHoras: number
  reunioes: number
  mes: string
}

export async function painelFluxo(): Promise<PainelFluxo> {
  const hoje = hojeSP()
  const desde = new Date(Date.parse(segundaDe(hoje) + 'T12:00:00Z') - 7 * 7 * 86400000).toISOString().slice(0, 10)
  const mes = hoje.slice(0, 7)
  const inicioMes = `${mes}-01T00:00:00-03:00`
  const feriados = feriadosDoAno(hoje)
  const dir = await carregarDiretorio()

  const [criados, saidos, abertos, reunioes, filas] = await Promise.all([
    supabaseAdmin.from('tickets').select('created_at').not('tipo', 'in', FORA_TIPOS).gte('created_at', `${desde}T00:00:00-03:00`).limit(5000),
    supabaseAdmin.from('tickets').select('resolvido_em, fechado_em, prazo').not('tipo', 'in', FORA_TIPOS).in('status', ['resolvido', 'fechado'])
      .or(`resolvido_em.gte.${desde}T00:00:00-03:00,fechado_em.gte.${desde}T00:00:00-03:00`).limit(5000),
    supabaseAdmin.from('tickets').select('created_at, updated_at').not('tipo', 'in', FORA_TIPOS).not('status', 'in', '(resolvido,fechado,cancelado)').limit(5000),
    supabaseAdmin.from('tickets').select('id, payload').eq('tipo', 'reuniao').neq('reuniao_etapa', 'cancelada').gte('reuniao_inicio', inicioMes).lte('reuniao_inicio', new Date().toISOString()).limit(500),
    resumoDasFilas(dir.pessoas.map((p) => p.id), { semBola: true }),
  ])

  // Saiu = a primeira data em que foi concluído (resolvido; se pulou direto, fechado).
  const saidas = ((saidos.data || []) as { resolvido_em: string | null; fechado_em: string | null; prazo: string | null }[])
    .map((t) => ({ dia: diaSPde((t.resolvido_em || t.fechado_em)!), prazo: t.prazo }))
  const semanas = entrouSaiuPorSemana(((criados.data || []) as { created_at: string }[]).map((t) => diaSPde(t.created_at)), saidas.map((s) => s.dia), hoje)

  const listaAbertos = (abertos.data || []) as { created_at: string; updated_at: string }[]
  const limite30 = Date.now() - 30 * 86400000

  const gargalos = dir.pessoas.map((p) => {
    const f = filas.get(p.id)
    const dias = f?.livreEm && f.livreEm >= hoje ? diasUteisEntre(hoje, f.livreEm, feriados) : 0
    return { nome: p.nome, setor: p.setor, semanas: Math.round((dias / 5) * 10) / 10, itens: f?.total || 0 }
  }).filter((g) => g.semanas > 0).sort((a, b) => b.semanas - a.semanas).slice(0, 5)

  // Horas em reunião no mês (o que já aconteceu): pessoas presentes × duração.
  const rids = ((reunioes.data || []) as { id: string }[]).map((r) => r.id)
  const { data: pres } = rids.length ? await supabaseAdmin.from('reunioes_presencas').select('reuniao_id, presente').in('reuniao_id', rids) : { data: [] }
  const nPres = new Map<string, number>()
  for (const p of (pres || []) as { reuniao_id: string; presente: boolean | null }[]) if (p.presente !== false) nPres.set(p.reuniao_id, (nPres.get(p.reuniao_id) || 0) + 1)
  const reuniaoHoras = ((reunioes.data || []) as { id: string; payload: { duracao_min?: number } | null }[])
    .reduce((s, r) => s + horasPessoa(nPres.get(r.id) || 0, Math.max(5, Number(r.payload?.duracao_min) || 30)), 0)

  return {
    semanas,
    abertos: listaAbertos.length,
    idadeMedia: idadeMedia(listaAbertos.map((t) => diaSPde(t.created_at)), hoje),
    parados30: listaAbertos.filter((t) => Date.parse(t.updated_at) < limite30).length,
    gargalos,
    prazos: prazosCumpridos(saidas.filter((s) => s.prazo && s.dia.slice(0, 7) === mes).map((s) => ({ prazo: s.prazo!, concluido: s.dia }))),
    reuniaoHoras: Math.round(reuniaoHoras * 10) / 10,
    reunioes: rids.length,
    mes,
  }
}
