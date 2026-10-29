/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CENTRAL DE TRABALHO — agenda da pessoa, confirmação de tickets e "Seu dia".
// (SERVIDOR, service role) Migration: sql/central-trabalho.sql.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { cronogramaAdmin } from '@/lib/cronograma/supabase-server'
import { STATUS_FINAIS } from '@/lib/tickets/constantes'
import { hojeSP } from './cronograma-server'
import { diasLivres, dataMinima, conflitos, type Ocupacao } from './agenda'

/** O que ocupa os dias da pessoa: etapas do cronograma + tickets com prazo. */
export async function ocupacaoDe(userId: string): Promise<Ocupacao[]> {
  const out: Ocupacao[] = []
  try {
    const db = cronogramaAdmin().schema('cronograma')
    const { data: recs } = await db.from('recursos').select('id').eq('ref_externa', userId)
    const ids = (recs || []).map((r: any) => r.id)
    if (ids.length) {
      const { data: tarefas } = await db.from('tarefas').select('nome, inicio_calc, fim_calc, status, ticket_id').in('recurso_id', ids).in('status', ['pendente', 'em_andamento', 'bloqueada'])
      for (const t of tarefas || []) if (t.inicio_calc && t.fim_calc) out.push({ ini: t.inicio_calc, fim: t.fim_calc, nome: t.nome, ticketId: t.ticket_id || null })
    }
  } catch { /* cronograma indisponível: só tickets */ }
  // Ticket ocupa do 1º dia de trabalho (payload.inicio) até o prazo. Resolvido
  // já foi feito; recusado não é mais da pessoa.
  const { data: tks } = await supabaseAdmin.from('tickets').select('id, titulo, prazo, status, payload, aceite')
    .eq('responsavel_id', userId).not('prazo', 'is', null).not('status', 'in', `(${[...STATUS_FINAIS, 'resolvido'].join(',')})`)
  const comEtapa = new Set(out.map((o) => o.ticketId).filter(Boolean))
  for (const t of tks || []) {
    if (comEtapa.has(t.id) || t.aceite === 'recusado') continue
    const ini = typeof t.payload?.inicio === 'string' && t.payload.inicio <= t.prazo ? t.payload.inicio : t.prazo
    out.push({ ini, fim: t.prazo, nome: t.titulo, ticketId: t.id })
  }
  // Tarefas com prazo atribuídas à pessoa (soltas ou passos de ticket).
  const { data: tarefas } = await supabaseAdmin.from('portal_tarefas').select('titulo, prazo, ticket_id')
    .eq('atribuido_a', userId).eq('concluida', false).not('prazo', 'is', null)
  for (const x of tarefas || []) {
    const d = diaSP(x.prazo)
    out.push({ ini: d, fim: d, nome: `Tarefa: ${x.titulo}`, ticketId: x.ticket_id || null })
  }
  return out
}

/** Dia (AAAA-MM-DD) de um timestamptz no fuso de São Paulo. */
export function diaSP(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts))
}

/** Sugestões a partir da data mínima (amanhã; hoje só se for muito urgente). */
export async function sugestaoAgenda(userId: string, duracao: number, desejado?: string | null, urgente = false) {
  const ocup = await ocupacaoDe(userId)
  const hoje = hojeSP()
  const minimo = dataMinima(hoje, urgente)
  // Muito urgente fura a fila: a data é hoje, ocupado ou não.
  const sugestoes = urgente ? [hoje] : diasLivres(ocup, minimo, duracao, 4)
  const sugestao = sugestoes[0] ?? minimo
  const inicio = desejado || sugestao
  return { hoje, minimo, sugestao, sugestoes, ocupacao: ocup, conflitos: conflitos(ocup, inicio, duracao) }
}


// ── Para confirmar + Seu dia ─────────────────────────────────────────────────
export async function pendentesDeAceite(userId: string) {
  try {
    const { data, error } = await supabaseAdmin.from('tickets')
      .select('id, numero, titulo, prazo, solicitante_id, quadro_id, visibilidade, created_at')
      .eq('responsavel_id', userId).eq('aceite', 'pendente').not('status', 'in', `(${[...STATUS_FINAIS, 'resolvido'].join(',')})`)
      .order('created_at')
    if (error) return []
    return data || []
  } catch { return [] }
}

export interface ItemDia { tipo: 'andamento' | 'comeca' | 'ticket' | 'tarefa' | 'reuniao'; texto: string; detalhe?: string; ticketId?: string | null; atrasado?: boolean; link?: string; hora?: string }

export async function itensDoDia(userId: string): Promise<ItemDia[]> {
  const hoje = hojeSP()
  const itens: ItemDia[] = await reunioesDoDia(userId, hoje)
  const ticketsNaEtapa = new Set<string>()
  try {
    const db = cronogramaAdmin().schema('cronograma')
    const { data: recs } = await db.from('recursos').select('id').eq('ref_externa', userId)
    const ids = (recs || []).map((r: any) => r.id)
    if (ids.length) {
      const { data: tarefas } = await db.from('tarefas').select('nome, inicio_calc, fim_calc, status, ticket_id').in('recurso_id', ids).in('status', ['pendente', 'em_andamento'])
      for (const t of tarefas || []) {
        if (t.ticket_id) ticketsNaEtapa.add(t.ticket_id)
        if (t.status === 'em_andamento') itens.push({ tipo: 'andamento', texto: t.nome, detalhe: t.fim_calc ? (t.fim_calc <= hoje ? 'termina hoje' : `previsto até ${br(t.fim_calc)}`) : undefined, ticketId: t.ticket_id, atrasado: !!t.fim_calc && t.fim_calc < hoje })
        else if (t.inicio_calc && t.inicio_calc <= hoje && (!t.fim_calc || t.fim_calc >= hoje)) itens.push({ tipo: 'comeca', texto: t.nome, detalhe: 'começa hoje pelo cronograma', ticketId: t.ticket_id })
      }
    }
  } catch { /* sem cronograma */ }
  // Mesma regra do Cronograma/Fila: resolvido já foi feito (só espera quem
  // pediu confirmar) e Solicitação de Compras segue o trilho dela — não entram.
  const { data: tks } = await supabaseAdmin.from('tickets').select('id, numero, titulo, status, prazo')
    .eq('responsavel_id', userId).not('tipo', 'in', '(compras,reuniao)').not('status', 'in', `(${[...STATUS_FINAIS, 'resolvido'].join(',')})`)
  const abertos = new Map((tks || []).map((t) => [t.id as string, t]))
  const noDia = new Map<string, ItemDia>()
  for (const t of tks || []) {
    if (ticketsNaEtapa.has(t.id)) continue
    const vence = t.prazo && t.prazo <= hoje
    if (t.status === 'em_andamento' || vence) {
      const item: ItemDia = { tipo: 'ticket', texto: `#${t.numero} ${t.titulo}`, detalhe: t.prazo ? (t.prazo < hoje ? `atrasado desde ${br(t.prazo)}` : t.prazo === hoje ? 'prazo hoje' : `prazo ${br(t.prazo)}`) : 'em andamento', ticketId: t.id, atrasado: !!t.prazo && t.prazo < hoje }
      noDia.set(t.id, item)
      itens.push(item)
    }
  }
  const { data: tarefas } = await supabaseAdmin.from('portal_tarefas').select('titulo, prazo, ticket_id')
    .eq('atribuido_a', userId).eq('concluida', false).not('prazo', 'is', null).lte('prazo', hoje + 'T23:59:59-03:00')
  for (const x of tarefas || []) {
    const d = diaSP(String(x.prazo))
    const quando = d < hoje ? `atrasada desde ${br(d)}` : 'vence hoje'
    if (!x.ticket_id) {
      itens.push({ tipo: 'tarefa', texto: x.titulo, detalhe: quando, atrasado: d < hoje })
      continue
    }
    // Tarefa de dentro de um ticket = passo dele: aparece NO ticket (o mesmo
    // cartão do Kanban), não como item a mais. Ticket resolvido/encerrado ou
    // de outra pessoa não entra.
    const t = abertos.get(x.ticket_id)
    if (!t || ticketsNaEtapa.has(t.id)) continue
    const passo = `passo "${x.titulo}" ${quando}`
    const ja = noDia.get(t.id)
    if (ja) { ja.detalhe = ja.detalhe ? `${ja.detalhe} · ${passo}` : passo; ja.atrasado = ja.atrasado || d < hoje; continue }
    const item: ItemDia = { tipo: 'ticket', texto: `#${t.numero} ${t.titulo}`, detalhe: passo, ticketId: t.id, atrasado: d < hoje }
    noDia.set(t.id, item)
    itens.push(item)
  }
  return itens
}
const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

// Reuniões de hoje em que a pessoa está (condutor, secretário ou participante), em ordem de horário.
// Vêm primeiro no Seu dia. Falhou (tabelas das reuniões ausentes) = lista vazia, o resto segue.
async function reunioesDoDia(userId: string, hoje: string): Promise<ItemDia[]> {
  try {
    const { data: pres } = await supabaseAdmin.from('reunioes_presencas').select('reuniao_id, papel').eq('usuario_id', userId)
    const papel = new Map((pres || []).map((p: { reuniao_id: string; papel: string }) => [p.reuniao_id, p.papel]))
    if (!papel.size) return []
    const { data: ts } = await supabaseAdmin.from('tickets').select('id, titulo, reuniao_inicio, reuniao_etapa, payload')
      .eq('tipo', 'reuniao').in('id', [...papel.keys()]).not('reuniao_etapa', 'in', '(cancelada,ata_publicada)')
      .gte('reuniao_inicio', hoje + 'T00:00:00-03:00').lte('reuniao_inicio', hoje + 'T23:59:59-03:00').order('reuniao_inicio')
    const hm = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
    return (ts || []).map((t: { id: string; titulo: string; reuniao_inicio: string; reuniao_etapa: string; payload: { duracao_min?: number } | null }) => {
      const dur = Math.max(5, Number(t.payload?.duracao_min) || 30)
      const fim = new Date(new Date(t.reuniao_inicio).getTime() + dur * 60_000).toISOString()
      const p = papel.get(t.id)
      return {
        tipo: 'reuniao' as const, texto: t.titulo, hora: hm(t.reuniao_inicio), link: `/reunioes/${t.id}`,
        detalhe: `${hm(t.reuniao_inicio)}–${hm(fim)}${p === 'condutor' ? ' · você conduz' : p === 'secretario' ? ' · você é o secretário' : ''}${t.reuniao_etapa === 'em_andamento' ? ' · acontecendo agora' : ''}`,
      }
    })
  } catch { return [] }
}

export async function diaConfirmado(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('ct_seu_dia').select('dia').eq('user_id', userId).eq('dia', hojeSP()).maybeSingle()
    return !!data
  } catch { return false }
}
export async function confirmarDia(userId: string) {
  await supabaseAdmin.from('ct_seu_dia').upsert({ user_id: userId, dia: hojeSP(), confirmado_em: new Date().toISOString() }, { onConflict: 'user_id,dia' })
}
export async function preferencias(userId: string): Promise<{ atalho_flutuante: boolean }> {
  try {
    const { data } = await supabaseAdmin.from('ct_preferencias').select('atalho_flutuante').eq('user_id', userId).maybeSingle()
    return { atalho_flutuante: data ? data.atalho_flutuante !== false : true }
  } catch { return { atalho_flutuante: true } }
}
export async function salvarPreferencias(userId: string, p: { atalho_flutuante: boolean }) {
  await supabaseAdmin.from('ct_preferencias').upsert({ user_id: userId, atalho_flutuante: p.atalho_flutuante, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
}
