// REUNIÕES — uma reunião: ticket + itens + presenças + bloco de pendências + ata.
// GET /api/reunioes/:id
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { avisoMesmaPessoa, corteEm, podeConduzir, somaTempo } from '@/lib/reunioes/regras'
import {
  carregarReuniao, podeVerReuniao, blocoPendencias, condutorDe, secretarioDe, papelNaReuniao, usuariosMin,
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
