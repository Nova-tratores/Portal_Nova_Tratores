// POPs — execuções recorrentes do POP (o cron /api/pops/cron/recorrencias gera os tickets).
// GET    /api/pops/:id/agendamentos
// POST   /api/pops/:id/agendamentos { recorrencia, dia_semana?, dia_mes?, responsavel_padrao_id, inicio_em? }
// PATCH  /api/pops/:id/agendamentos { agendamento_id, ativo?, responsavel_padrao_id? }
// DELETE /api/pops/:id/agendamentos?agendamento_id=<uuid>  (execuções já geradas ficam)
// Quem pode: quem edita o POP. Modelo do sistema não se agenda.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, carregarPop, erro, erroBanco, usuarioAtivo, type PopRow } from '@/lib/pops/server'
import { podeEditarPop, uuidValido, validarAgendamento } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guarda(req: NextRequest, id: string): Promise<{ pop: PopRow; userId: string } | Response> {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!uuidValido(id)) return erro('POP não encontrado', 404)
  const pop = await carregarPop(id)
  if (!pop) return erro('POP não encontrado', 404)
  if (!podeEditarPop(await atorDe(auth), pop)) return erro('Só quem cuida do POP mexe nos agendamentos.', 403)
  if (pop.template_tipo === 'sistema') return erro('Modelo do sistema não é executado; duplique para a sua área.')
  return { pop, userId: auth.userId }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const { data, error } = await supabaseAdmin.from('pops_agendamentos').select('*').eq('pop_id', id).order('criado_em')
    if (error) return erroBanco(error)
    return NextResponse.json({ agendamentos: data || [] })
  } catch (e) { return erroBanco(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const v = validarAgendamento(body)
    if ('erro' in v) return erro(v.erro)
    if (!(await usuarioAtivo(v.dados.responsavel_padrao_id))) return erro('Responsável inativo.')
    const { data, error } = await supabaseAdmin.from('pops_agendamentos')
      .insert({ ...v.dados, pop_id: id, criado_por: g.userId }).select('*').single()
    if (error) return erroBanco(error)
    return NextResponse.json({ agendamento: data }, { status: 201 })
  } catch (e) { return erroBanco(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const agId = String(body.agendamento_id || '')
    if (!uuidValido(agId)) return erro('Agendamento não encontrado', 404)
    const patch: Record<string, unknown> = {}
    if ('ativo' in body) patch.ativo = body.ativo === true
    if ('responsavel_padrao_id' in body) {
      const r = String(body.responsavel_padrao_id || '')
      if (!uuidValido(r) || !(await usuarioAtivo(r))) return erro('Responsável inválido ou inativo.')
      patch.responsavel_padrao_id = r
    }
    if (!Object.keys(patch).length) return erro('Nada para alterar.')
    const { data, error } = await supabaseAdmin.from('pops_agendamentos').update(patch)
      .eq('id', agId).eq('pop_id', id).select('*').maybeSingle()
    if (error) return erroBanco(error)
    if (!data) return erro('Agendamento não encontrado', 404)
    return NextResponse.json({ agendamento: data })
  } catch (e) { return erroBanco(e) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const agId = req.nextUrl.searchParams.get('agendamento_id') || ''
    if (!uuidValido(agId)) return erro('Agendamento não encontrado', 404)
    const { error } = await supabaseAdmin.from('pops_agendamentos').delete().eq('id', agId).eq('pop_id', id)
    if (error) return erroBanco(error)
    return NextResponse.json({ ok: true })
  } catch (e) { return erroBanco(e) }
}
