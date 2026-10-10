// POPs — ciência de leitura ("li e entendi").
// GET  /api/pops/ciencia                → minhas ciências PENDENTES (versão publicada que me foi exigida)
// GET  /api/pops/ciencia?versao_id=<id> → quem já deu e quem falta (só quem edita o POP)
// POST /api/pops/ciencia { versao_id }  → dou ciência (qualquer usuário logado; só versão publicada)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, carregarPop, carregarVersao, erro, erroBanco, rpc, usuariosMin } from '@/lib/pops/server'
import { podeEditarPop, uuidValido } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const versaoId = req.nextUrl.searchParams.get('versao_id')
    if (versaoId) {
      if (!uuidValido(versaoId)) return erro('Versão não encontrada', 404)
      const v = await carregarVersao(versaoId)
      const pop = v && await carregarPop(v.pop_id)
      if (!v || !pop) return erro('Versão não encontrada', 404)
      if (!podeEditarPop(await atorDe(auth), pop)) return erro('Só quem cuida do POP vê a lista de ciência.', 403)
      const [exigidos, dados] = await Promise.all([
        supabaseAdmin.from('pops_ciencia_exigida').select('usuario_id, exigido_em').eq('versao_id', versaoId).order('usuario_id'),
        supabaseAdmin.from('pops_ciencias').select('usuario_id, ciente_em').eq('versao_id', versaoId).order('ciente_em'),
      ])
      if (exigidos.error) return erroBanco(exigidos.error)
      const deram = new Map((dados.data || []).map((d) => [d.usuario_id as string, d.ciente_em as string]))
      const lista = (exigidos.data || []).map((e) => ({ usuario_id: e.usuario_id, exigido_em: e.exigido_em, ciente_em: deram.get(e.usuario_id) || null }))
      const usuarios = await usuariosMin([...lista.map((l) => l.usuario_id), ...deram.keys()])
      return NextResponse.json({
        versao_id: versaoId, lista, usuarios,
        total: lista.length, pendentes: lista.filter((l) => !l.ciente_em).length,
        espontaneas: [...deram.keys()].filter((u) => !lista.some((l) => l.usuario_id === u)).length,
      })
    }

    // Minhas pendentes: exigidas para mim, versão AINDA publicada, sem ciência.
    const { data: exig, error } = await supabaseAdmin.from('pops_ciencia_exigida')
      .select('versao_id, exigido_em').eq('usuario_id', auth.userId).order('exigido_em')
    if (error) return erroBanco(error)
    const ids = (exig || []).map((e) => e.versao_id as string)
    if (!ids.length) return NextResponse.json({ pendentes: [] })
    const [vs, cs] = await Promise.all([
      supabaseAdmin.from('pops_versoes').select('id, numero, pop_id, publicado_em').in('id', ids).eq('estado', 'publicado'),
      supabaseAdmin.from('pops_ciencias').select('versao_id').eq('usuario_id', auth.userId).in('versao_id', ids),
    ])
    const feitas = new Set((cs.data || []).map((c) => c.versao_id as string))
    const abertas = (vs.data || []).filter((v) => !feitas.has(v.id))
    const pops = abertas.length
      ? (await supabaseAdmin.from('pops').select('id, codigo, titulo').in('id', abertas.map((v) => v.pop_id))).data || []
      : []
    const porId = new Map(pops.map((p) => [p.id, p]))
    return NextResponse.json({
      pendentes: abertas.map((v) => ({ versao_id: v.id, numero: v.numero, publicado_em: v.publicado_em, pop: porId.get(v.pop_id) || null })),
    })
  } catch (e) {
    return erroBanco(e)
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const versaoId = String(body.versao_id || '')
    if (!uuidValido(versaoId)) return erro('Versão não encontrada', 404)
    const v = await carregarVersao(versaoId)
    if (!v) return erro('Versão não encontrada', 404)
    if (v.estado !== 'publicado') return erro('Só se dá ciência na versão publicada vigente.', 409)
    const nova = await rpc<boolean>('pops_dar_ciencia', { p_versao: versaoId, p_usuario: auth.userId })
    return NextResponse.json({ ok: true, nova })
  } catch (e) {
    return erroBanco(e)
  }
}
