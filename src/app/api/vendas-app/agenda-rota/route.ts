// Rota da semana do app de vendas (NT Vendas) → Agenda coletiva.
// Chamado direto do navegador do app (CORS corsVendas), com o token do login
// (mesmo Supabase Auth do portal). Só vendedor ATIVO (vendedores.auth_uid).
//   GET  ?de=YYYY-MM-DD&ate=YYYY-MM-DD  → { eventos } compromissos do vendedor na agenda (máx. 62 dias)
//   PUT  { semana, itens[] }            → substitui os compromissos da rota daquela semana
// Regras puras em lib/agenda/rota-vendas.ts. Só toca em compromissos com
// origem = 'rota_vendas'; os criados à mão na agenda ficam como estão.
// Migration: sql/agenda-rota-vendas.sql (sem ela → 503 com a mensagem).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { corsVendas } from '@/lib/vendas-app/cors'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import {
  ORIGEM_ROTA, planejarSincronizacao, somarDias, validarSemana, isoBR, type EventoRotaDb,
} from '@/lib/agenda/rota-vendas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METODOS = 'GET, PUT, OPTIONS'
const MSG_MIGRATION = 'A Agenda ainda não recebe a rota do app: falta rodar sql/agenda-rota-vendas.sql no Supabase.'
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

function responder(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, METODOS) })
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, METODOS) })
}

/** Erro de coluna/tabela ausente (migration não aplicada). */
const faltaMigration = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || e.code === '42P01' || e.code === 'PGRST205' || /origem/.test(e.message || ''))

async function vendedorAtivo(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return { auth: null, vendedor: null }
  const { data } = await supabaseAdmin.from('vendedores').select('id, nome, ativo').eq('auth_uid', auth.userId).maybeSingle()
  return { auth, vendedor: data && data.ativo !== false ? data : null }
}

export async function GET(req: NextRequest) {
  const { auth, vendedor } = await vendedorAtivo(req)
  if (!auth) return responder(req, { error: 'Não autenticado' }, 401)
  if (!vendedor) return responder(req, { error: 'Só vendedor ativo do NT Vendas.' }, 403)
  const de = req.nextUrl.searchParams.get('de') || ''
  const ate = req.nextUrl.searchParams.get('ate') || ''
  if (!DIA_RE.test(de) || !DIA_RE.test(ate) || ate < de || somarDias(de, 62) < ate) {
    return responder(req, { error: 'Período inválido (de/ate, até 62 dias).' }, 400)
  }
  const { data, error } = await supabaseAdmin
    .from('agenda_eventos')
    .select('id, titulo, local, descricao, inicio, fim, dia_inteiro, origem, origem_ref')
    .eq('criado_por', auth.userId)
    .is('cancelado_em', null)
    .lt('inicio', isoBR(somarDias(ate, 1), '00:00'))
    .gte('fim', isoBR(de, '00:00'))
    .order('inicio')
  if (error) return responder(req, { error: faltaMigration(error) ? MSG_MIGRATION : error.message }, faltaMigration(error) ? 503 : 500)
  return responder(req, { eventos: data || [] })
}

export async function PUT(req: NextRequest) {
  const { auth, vendedor } = await vendedorAtivo(req)
  if (!auth) return responder(req, { error: 'Não autenticado' }, 401)
  if (!vendedor) return responder(req, { error: 'Só vendedor ativo do NT Vendas.' }, 403)
  const v = validarSemana((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!v.ok) return responder(req, { error: v.erro }, 400)

  const { data: existentes, error: errLer } = await supabaseAdmin
    .from('agenda_eventos')
    .select('id, origem_ref, titulo, local, descricao, inicio, fim')
    .eq('criado_por', auth.userId)
    .eq('origem', ORIGEM_ROTA)
    .is('cancelado_em', null)
    .gte('inicio', isoBR(v.semana, '00:00'))
    .lt('inicio', isoBR(somarDias(v.semana, 7), '00:00'))
  if (errLer) return responder(req, { error: faltaMigration(errLer) ? MSG_MIGRATION : errLer.message }, faltaMigration(errLer) ? 503 : 500)

  const plano = planejarSincronizacao((existentes || []) as EventoRotaDb[], v.itens)
  const agora = new Date().toISOString()

  // Cancela primeiro: libera o índice único (criado_por, origem, origem_ref) para quem foi recriado.
  if (plano.cancelar.length) {
    const { error } = await supabaseAdmin.from('agenda_eventos').update({ cancelado_em: agora, updated_at: agora }).in('id', plano.cancelar)
    if (error) return responder(req, { error: error.message }, 500)
  }
  for (const a of plano.atualizar) {
    const { error } = await supabaseAdmin.from('agenda_eventos').update({ ...a.campos, updated_at: agora }).eq('id', a.id)
    if (error) return responder(req, { error: error.message }, 500)
  }
  if (plano.criar.length) {
    const { error } = await supabaseAdmin.from('agenda_eventos').insert(
      plano.criar.map((c) => ({ ...c, origem: ORIGEM_ROTA, dia_inteiro: false, criado_por: auth.userId })),
    )
    if (error) return responder(req, { error: error.message }, 500)
  }

  await registrarAuditLog({
    userId: auth.userId, userName: vendedor.nome, sistema: 'agenda', acao: 'rota_semana',
    entidade: 'semana', entidadeId: v.semana, entidadeLabel: `Rota da semana ${v.semana}`,
    detalhes: { criados: plano.criar.length, atualizados: plano.atualizar.length, cancelados: plano.cancelar.length, iguais: plano.iguais },
  }).catch(() => {})

  return responder(req, {
    ok: true, semana: v.semana,
    criados: plano.criar.length, atualizados: plano.atualizar.length, cancelados: plano.cancelar.length, iguais: plano.iguais,
  })
}
