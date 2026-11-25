// SUGESTÕES PARA A PAUTA (melhorias 4.1, 25/11/2026)
// GET /api/reunioes/:id/sugestoes -> { anterior, ultima: [...], travados: [...], ocultos }
//  1. "O que ficou da última": os pedidos (ações) que nasceram na reunião anterior da mesma série, com a
//     situação de agora. (Os assuntos adiados/fora do tema da anterior já entram sozinhos — puxarSugestoes.)
//  2. "Travados": pedidos dos participantes — como RESPONSÁVEL (aguardando interno, bola parada ou prazo
//     impossível, a mesma conta da Minha fila) ou como SOLICITANTE (aguardando interno).
//  3. "Ideias marcadas": fica para a Fase 5 (as ideias ainda não têm a marca "levar para reunião").
// Privacidade: título só do pedido que quem olha pode ver (público, ou é envolvido nele). Os outros
// viram só um número ("+2 pedidos privados"), sem id — não dá para incluir o que não se vê.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { carregarReuniao, podeVerReuniao, reuniaoAnteriorDaSerie, usuariosMin, migrationFaltou, MSG_MIGRATION_REUNIOES } from '@/lib/reunioes/server'
import { resumoDasFilas } from '@/lib/trabalho/fila-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Tk = { id: string; numero: number; titulo: string; status: string; prazo: string | null; responsavel_id: string; solicitante_id: string; visibilidade: string }
export interface Sugestao { id: string; numero: number; titulo: string; status: string; prazo: string | null; responsavel_id: string; motivo: string; incluido: boolean }

const MOTIVO_ORDEM = ['prazo impossível', 'bola parada', 'aguardando interno']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { id } = await params
  try {
    const r = await carregarReuniao(id)
    if (!r || !(await podeVerReuniao(r, auth))) return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 })
    const pessoas = [...new Set(r.presencas.map((p) => p.usuario_id))]
    const naPauta = new Set(r.itens.map((i) => i.ticket_referencia_id).filter((x): x is string => !!x))

    const anterior = r.serie && r.ticket.reuniao_inicio ? await reuniaoAnteriorDaSerie(r.serie.id, r.ticket.reuniao_inicio, r.ticket.id) : null
    const [acoesAnt, filas, aguardando] = await Promise.all([
      anterior
        ? supabaseAdmin.from('tickets').select('id, numero, titulo, status, prazo, responsavel_id, solicitante_id, visibilidade').eq('origem_reuniao_id', anterior.id).order('created_at').limit(100)
        : Promise.resolve({ data: [] as Tk[] }),
      pessoas.length ? resumoDasFilas(pessoas) : Promise.resolve(new Map()),
      pessoas.length
        ? supabaseAdmin.from('tickets').select('id, numero, titulo, status, prazo, responsavel_id, solicitante_id, visibilidade')
          .in('solicitante_id', pessoas).eq('status', 'aguardando_interno').not('tipo', 'in', '(compras,reuniao)').limit(200)
        : Promise.resolve({ data: [] as Tk[] }),
    ])

    // Travados do lado de quem FAZ (mesma conta da Minha fila) + do lado de quem PEDIU (aguardando interno).
    const candidatos = new Map<string, { t: Omit<Tk, 'visibilidade' | 'solicitante_id'> & { visibilidade: string; solicitante_id: string }; motivo: string }>()
    for (const uid of pessoas) {
      const f = filas.get(uid)
      if (!f) continue
      for (const i of [...f.hoje, ...f.semana, ...f.listaDepois]) {
        const motivo = i.impossivel ? 'prazo impossível' : i.bola ? 'bola parada' : i.status === 'aguardando_interno' ? 'aguardando interno' : ''
        if (!motivo) continue
        candidatos.set(i.id, { t: { id: i.id, numero: i.numero, titulo: i.titulo, status: i.status, prazo: i.prazo, responsavel_id: uid, solicitante_id: i.solicitante_id, visibilidade: i.visibilidade }, motivo })
      }
    }
    for (const t of ((aguardando.data || []) as Tk[])) if (!candidatos.has(t.id)) candidatos.set(t.id, { t, motivo: 'aguardando interno' })

    // Quem olha vê o título? Público, ou é solicitante/responsável/participante.
    const privados = [...candidatos.values()].filter(({ t }) => t.visibilidade !== 'publico' && t.solicitante_id !== auth.userId && t.responsavel_id !== auth.userId).map(({ t }) => t.id)
    const { data: parts } = privados.length
      ? await supabaseAdmin.from('tickets_participantes').select('ticket_id').in('ticket_id', privados).eq('user_id', auth.userId).is('removido_em', null)
      : { data: [] as { ticket_id: string }[] }
    const souParte = new Set(((parts || []) as { ticket_id: string }[]).map((p) => p.ticket_id))
    const vejo = (t: { id: string; visibilidade: string; solicitante_id: string; responsavel_id: string }) =>
      t.visibilidade === 'publico' || t.solicitante_id === auth.userId || t.responsavel_id === auth.userId || souParte.has(t.id)

    const travados: Sugestao[] = []
    let ocultos = 0
    for (const { t, motivo } of candidatos.values()) {
      if (!vejo(t)) { ocultos++; continue }
      travados.push({ id: t.id, numero: t.numero, titulo: t.titulo, status: t.status, prazo: t.prazo, responsavel_id: t.responsavel_id, motivo, incluido: naPauta.has(t.id) })
    }
    travados.sort((a, b) => MOTIVO_ORDEM.indexOf(a.motivo) - MOTIVO_ORDEM.indexOf(b.motivo) || a.numero - b.numero)

    // As ações da anterior: as da própria série são vistas por quem está na reunião (nasceram nela).
    const ultima: Sugestao[] = ((acoesAnt.data || []) as Tk[]).map((t) => ({
      id: t.id, numero: t.numero, titulo: t.titulo, status: t.status, prazo: t.prazo, responsavel_id: t.responsavel_id,
      motivo: ['resolvido', 'fechado'].includes(t.status) ? 'feito' : t.status === 'cancelado' ? 'cancelado' : 'em aberto', incluido: naPauta.has(t.id),
    }))

    const usuarios = await usuariosMin([...travados, ...ultima].map((x) => x.responsavel_id))
    return NextResponse.json({
      anterior: anterior ? { id: anterior.id, numero: anterior.numero, prazo: anterior.prazo } : null,
      ultima, travados: travados.slice(0, 40), mais: Math.max(0, travados.length - 40), ocultos, usuarios,
    })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_REUNIOES }, { status: 503 })
    console.error('[reunioes/sugestoes] GET', e)
    return NextResponse.json({ error: 'Falha ao montar as sugestões' }, { status: 500 })
  }
}
