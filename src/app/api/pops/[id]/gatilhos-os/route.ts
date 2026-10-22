// POPs — regras "a OS dispara este POP" (src/lib/pops/gatilhos-os.ts executa).
// GET    /api/pops/:id/gatilhos-os  regras + opções (tipos de serviço e fases do POS) + últimos disparos
// POST   /api/pops/:id/gatilhos-os { tipo_servico, fase, responsavel_padrao_id }
// PATCH  /api/pops/:id/gatilhos-os { gatilho_id, ativo?, responsavel_padrao_id? }
// DELETE /api/pops/:id/gatilhos-os?gatilho_id=<uuid>  (execuções já criadas ficam)
// Quem pode: quem edita o POP. Modelo do sistema não dispara.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import { PHASES } from '@/lib/pos/constants'
import { atorDe, carregarPop, erro, erroBanco, usuarioAtivo, type PopRow } from '@/lib/pops/server'
import { podeEditarPop, uuidValido, validarGatilhoOS } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_FALTA = 'Disparar pela OS ainda não está ligado no banco (falta a migration sql/pops-04-gatilhos-os-etiquetas.sql).'

async function guarda(req: NextRequest, id: string): Promise<{ pop: PopRow; userId: string } | Response> {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!uuidValido(id)) return erro('POP não encontrado', 404)
  const pop = await carregarPop(id)
  if (!pop) return erro('POP não encontrado', 404)
  if (!podeEditarPop(await atorDe(auth), pop)) return erro('Só quem cuida do POP mexe nas regras.', 403)
  if (pop.template_tipo === 'sistema') return erro('Modelo do sistema não é executado; duplique para a sua área.')
  return { pop, userId: auth.userId }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    // Tipos de serviço que aparecem nas OS (o campo é texto livre no POS).
    const { data: oss } = await supabaseAdmin.from('Ordem_Servico').select('Tipo_Servico')
      .not('Tipo_Servico', 'is', null).order('Data', { ascending: false }).limit(3000)
    const tipos = [...new Set(((oss || []) as { Tipo_Servico: string | null }[])
      .map((o) => String(o.Tipo_Servico || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const opcoes = { tipos, fases: PHASES.filter((f) => f !== 'Cancelada') }

    const { data, error } = await supabaseAdmin.from('pops_gatilhos_os').select('*').eq('pop_id', id).order('criado_em')
    if (error) {
      if (migrationFaltou(error)) return NextResponse.json({ gatilhos: [], disparos: [], opcoes, migracaoFaltando: true, aviso: MSG_FALTA })
      return erroBanco(error)
    }
    const ids = (data || []).map((x) => x.id as string)
    const disparos = ids.length
      ? (await supabaseAdmin.from('pops_gatilhos_os_disparos').select('gatilho_id, os_id, ticket_id, erro, criado_em')
          .in('gatilho_id', ids).order('criado_em', { ascending: false }).limit(30)).data || []
      : []
    return NextResponse.json({ gatilhos: data || [], disparos, opcoes })
  } catch (e) { return erroBanco(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const v = validarGatilhoOS(body)
    if ('erro' in v) return erro(v.erro)
    if (!(await usuarioAtivo(v.dados.responsavel_padrao_id))) return erro('Responsável inativo.')
    const { data, error } = await supabaseAdmin.from('pops_gatilhos_os')
      .insert({ ...v.dados, pop_id: id, criado_por: g.userId }).select('*').single()
    if (error) {
      if (migrationFaltou(error)) return erro(MSG_FALTA, 503, { migracaoFaltando: true })
      if (error.code === '23505') return erro('Já existe uma regra igual (mesmo tipo e fase).', 409)
      return erroBanco(error)
    }
    return NextResponse.json({ gatilho: data }, { status: 201 })
  } catch (e) { return erroBanco(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const gid = String(body.gatilho_id || '')
    if (!uuidValido(gid)) return erro('Regra não encontrada', 404)
    const patch: Record<string, unknown> = {}
    if ('ativo' in body) patch.ativo = body.ativo === true
    if ('responsavel_padrao_id' in body) {
      const r = String(body.responsavel_padrao_id || '')
      if (!uuidValido(r) || !(await usuarioAtivo(r))) return erro('Responsável inválido ou inativo.')
      patch.responsavel_padrao_id = r
    }
    if (!Object.keys(patch).length) return erro('Nada para alterar.')
    const { data, error } = await supabaseAdmin.from('pops_gatilhos_os').update(patch)
      .eq('id', gid).eq('pop_id', id).select('*').maybeSingle()
    if (error) return erroBanco(error)
    if (!data) return erro('Regra não encontrada', 404)
    return NextResponse.json({ gatilho: data })
  } catch (e) { return erroBanco(e) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const g = await guarda(req, id)
    if (g instanceof Response) return g
    const gid = req.nextUrl.searchParams.get('gatilho_id') || ''
    if (!uuidValido(gid)) return erro('Regra não encontrada', 404)
    const { error } = await supabaseAdmin.from('pops_gatilhos_os').delete().eq('id', gid).eq('pop_id', id)
    if (error) return erroBanco(error)
    return NextResponse.json({ ok: true })
  } catch (e) { return erroBanco(e) }
}
