// REUNIÕES — uma reunião: ticket + itens + presenças + bloco de pendências + ata.
// GET /api/reunioes/:id
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { avisoMesmaPessoa, corteEm, podeConduzir, somaTempo } from '@/lib/reunioes/regras'
import {
  carregarReuniao, podeVerReuniao, blocoPendencias, condutorDe, secretarioDe, papelNaReuniao, usuariosMin, proximaReuniaoDaSerie,
  migrationFaltou, MSG_MIGRATION_REUNIOES,
} from '@/lib/reunioes/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { id } = await params
  try {
    const r = await carregarReuniao(id)
    if (!r || !(await podeVerReuniao(r, auth))) return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 })
    const [pend, acoes] = await Promise.all([
      blocoPendencias(r),
      supabaseAdmin.from('tickets').select('id, numero, titulo, status, prazo, responsavel_id, aceite, origem_reuniao_item_id, prazo_reprogramacoes')
        .eq('origem_reuniao_id', r.ticket.id).order('created_at'),
    ])
    const { destinos, origens, proxima } = await reagendamentos(r)
    const condutor = condutorDe(r)
    const secretario = secretarioDe(r)
    const ids = [
      ...r.presencas.map((p) => p.usuario_id), ...r.itens.map((i) => i.trazido_por),
      ...pend.atrasadas.map((p) => p.responsavel_id), ...pend.vencendo.map((p) => p.responsavel_id),
      ...((acoes.data || []) as { responsavel_id: string }[]).map((a) => a.responsavel_id),
    ]
    const usuarios = await usuariosMin(ids)
    const corte = r.ticket.reuniao_inicio ? corteEm(r.ticket.reuniao_inicio, r.serie?.corte_antecedencia_horas ?? 18).toISOString() : null
    return NextResponse.json({
      reuniao: r.ticket, serie: r.serie, itens: r.itens, presencas: r.presencas, ata: r.ata,
      etapa_efetiva: r.etapaEfetiva, corte_em: corte,
      pendencias: pend, acoes: acoes.data || [], usuarios,
      destinos, origens, proxima,
      condutor_id: condutor, secretario_id: secretario,
      meu_papel: papelNaReuniao(r, auth.userId),
      posso_conduzir: podeConduzir(r.presencas, auth.userId, auth.isAdmin),
      aviso: avisoMesmaPessoa(condutor, secretario),
      tempo_previsto: somaTempo(r.itens),
      duracao_min: Number((r.ticket.payload as { duracao_min?: unknown })?.duracao_min) || r.serie?.duracao_min || 30,
    })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_REUNIOES }, { status: 503 })
    console.error('[reunioes/id] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar a reunião' }, { status: 500 })
  }
}

type Ref = { reuniao_id: string; numero: number; prazo: string | null }

/**
 * Item adiado/fora do tema: para qual reunião ele foi copiado (destinos, por id do item daqui),
 * de qual reunião veio o que chegou aqui (origens, por item_origem_id) e a próxima da série.
 */
async function reagendamentos(r: NonNullable<Awaited<ReturnType<typeof carregarReuniao>>>) {
  const meus = r.itens.map((i) => i.id)
  const deOutras = r.itens.map((i) => i.item_origem_id).filter((x): x is string => !!x)
  const [copias, vindos, prox] = await Promise.all([
    meus.length ? supabaseAdmin.from('reunioes_itens').select('item_origem_id, reuniao_id').in('item_origem_id', meus) : Promise.resolve({ data: [] }),
    deOutras.length ? supabaseAdmin.from('reunioes_itens').select('id, reuniao_id').in('id', deOutras) : Promise.resolve({ data: [] }),
    r.serie && r.ticket.reuniao_inicio ? proximaReuniaoDaSerie(r.serie.id, r.ticket.reuniao_inicio, r.ticket.id) : Promise.resolve(null),
  ])
  const c = (copias.data || []) as { item_origem_id: string; reuniao_id: string }[]
  const v = (vindos.data || []) as { id: string; reuniao_id: string }[]
  const ids = [...new Set([...c.map((x) => x.reuniao_id), ...v.map((x) => x.reuniao_id)])]
  const { data: ts } = ids.length
    ? await supabaseAdmin.from('tickets').select('id, numero, prazo').in('id', ids)
    : { data: [] as { id: string; numero: number; prazo: string | null }[] }
  const ref = new Map(((ts || []) as { id: string; numero: number; prazo: string | null }[]).map((t) => [t.id, { reuniao_id: t.id, numero: t.numero, prazo: t.prazo }]))
  const destinos: Record<string, Ref> = {}
  for (const x of c) {
    const t = ref.get(x.reuniao_id); if (!t) continue
    const atual = destinos[x.item_origem_id]
    if (!atual || (t.prazo || '') < (atual.prazo || '')) destinos[x.item_origem_id] = t   // a mais próxima
  }
  const origens: Record<string, Ref> = {}
  for (const x of v) { const t = ref.get(x.reuniao_id); if (t) origens[x.id] = t }
  const proxima: Ref | null = prox ? { reuniao_id: prox.id, numero: prox.numero, prazo: prox.prazo } : null
  return { destinos, origens, proxima }
}
