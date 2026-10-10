// POPs — áreas e papéis por área (dono / aprovador).
// GET  /api/pops/areas   → áreas + papéis (qualquer usuário logado; o seletor de área usa)
// POST /api/pops/areas { acao, ... }   → só o admin do módulo
//   criar_area { sigla, nome } · ativar { area_id, ativo } · renomear { area_id, nome }
//   papel_add { area_id, user_id, papel } · papel_remover { area_id, user_id, papel }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, erro, erroBanco, usuarioAtivo, usuariosMin } from '@/lib/pops/server'
import { ehAdminPops, uuidValido } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const [areas, papeis, ator] = await Promise.all([
      supabaseAdmin.from('pops_areas').select('id, sigla, nome, ativo').order('sigla'),
      supabaseAdmin.from('pops_area_papeis').select('area_id, user_id, papel').order('area_id').order('papel').order('user_id'),
      atorDe(auth),
    ])
    if (areas.error) return erroBanco(areas.error)
    const usuarios = await usuariosMin((papeis.data || []).map((p) => p.user_id as string))
    return NextResponse.json({
      areas: areas.data || [], papeis: papeis.data || [], usuarios,
      eu: { admin: ehAdminPops(ator), papeis: ator.papeisArea },
    })
  } catch (e) { return erroBanco(e) }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    if (!ehAdminPops(await atorDe(auth))) return erro('Só o admin do módulo gerencia áreas e papéis.', 403)
    const acao = String(body.acao || '')
    const areaId = String(body.area_id || '')

    if (acao === 'criar_area') {
      const sigla = String(body.sigla || '').trim().toUpperCase()
      const nome = String(body.nome || '').trim()
      if (!/^[A-Z]{2,4}$/.test(sigla)) return erro('Sigla de 2 a 4 letras.')
      if (!nome || nome.length > 80) return erro('Nome obrigatório (até 80).')
      const { data, error } = await supabaseAdmin.from('pops_areas').insert({ sigla, nome }).select('*').single()
      if (error) return erroBanco(error)
      return NextResponse.json({ area: data }, { status: 201 })
    }
    if (!uuidValido(areaId)) return erro('Área não encontrada', 404)

    if (acao === 'ativar' || acao === 'renomear') {
      const patch = acao === 'ativar' ? { ativo: body.ativo === true } : { nome: String(body.nome || '').trim().slice(0, 80) }
      if ('nome' in patch && !patch.nome) return erro('Nome obrigatório.')
      const { data, error } = await supabaseAdmin.from('pops_areas').update(patch).eq('id', areaId).select('*').maybeSingle()
      if (error) return erroBanco(error)
      if (!data) return erro('Área não encontrada', 404)
      return NextResponse.json({ area: data })
    }

    if (acao === 'papel_add' || acao === 'papel_remover') {
      const userId = String(body.user_id || '')
      const papel = String(body.papel || '')
      if (!uuidValido(userId)) return erro('Escolha a pessoa.')
      if (papel !== 'dono' && papel !== 'aprovador') return erro('Papel inválido.')
      if (acao === 'papel_add') {
        if (!(await usuarioAtivo(userId))) return erro('Pessoa inativa.')
        const { error } = await supabaseAdmin.from('pops_area_papeis')
          .upsert({ area_id: areaId, user_id: userId, papel, criado_por: auth.userId }, { onConflict: 'area_id,user_id,papel', ignoreDuplicates: true })
        if (error) return erroBanco(error)
      } else {
        const { error } = await supabaseAdmin.from('pops_area_papeis').delete()
          .eq('area_id', areaId).eq('user_id', userId).eq('papel', papel)
        if (error) return erroBanco(error)
      }
      return NextResponse.json({ ok: true })
    }

    return erro('Ação desconhecida.')
  } catch (e) { return erroBanco(e) }
}
