// POPs — ROTEIROS (modelos): checklists em sequência para anexar a uma OS.
// GET   /api/pops/roteiros[?inativos=1]  modelos + POPs publicados (para o seletor) + áreas
// POST  /api/pops/roteiros { id?, nome, descricao, area_id, etapas[] }  cria ou regrava
// PATCH /api/pops/roteiros { id, ativo }
// Ler: qualquer logado (o bloco da OS escolhe por aqui). Gravar: admin de POPs ou dono da área.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, erro, erroBanco, usuariosMin } from '@/lib/pops/server'
import { podeCriarNaArea, uuidValido } from '@/lib/pops/regras'
import { validarRoteiro } from '@/lib/pops/roteiros'
import { ativarModelo, ErroRoteiro, listarModelos, salvarModelo } from '@/lib/pops/roteiros-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Roteiros ainda não estão ligados no banco (falta a migration sql/pops-05-roteiros.sql).'
const faltaTabela = (e: unknown) => /pops_(os_)?roteiro|pops_os_etapas|PGRST205|42P01/.test(String((e as { message?: string; code?: string })?.message || '') + String((e as { code?: string })?.code || ''))

function falha(e: unknown) {
  if (e instanceof ErroRoteiro) return erro(e.message, e.status)
  if (faltaTabela(e)) return erro(MSG_SQL, 503, { migracaoFaltando: true })
  return erroBanco(e)
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const ator = await atorDe(auth)
    const inativos = new URL(req.url).searchParams.get('inativos') === '1'
    const [modelos, pops, pub, areas] = await Promise.all([
      listarModelos(inativos),
      supabaseAdmin.from('pops').select('id, codigo, titulo, area_id, template_tipo').eq('arquivado', false).order('codigo').limit(1000),
      supabaseAdmin.from('pops_versoes').select('pop_id').eq('estado', 'publicado').limit(2000),
      supabaseAdmin.from('pops_areas').select('id, sigla, nome, ativo').order('sigla'),
    ])
    const publicados = new Set((pub.data || []).map((v) => v.pop_id as string))
    const opcoes = (pops.data || []).filter((p) => p.template_tipo !== 'sistema' && publicados.has(p.id as string))
    const usuarios = await usuariosMin(modelos.flatMap((m) => (m.etapas as { responsavel_padrao_id: string | null }[]).map((e) => e.responsavel_padrao_id)))
    const podeEditar = (areas.data || []).filter((a) => podeCriarNaArea(ator, a.id as string)).map((a) => a.id)
    return NextResponse.json({ roteiros: modelos, pops: opcoes, areas: areas.data || [], usuarios, podeEditarAreas: podeEditar })
  } catch (e) { return falha(e) }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const v = validarRoteiro(body)
  if ('erro' in v) return erro(v.erro)
  try {
    const ator = await atorDe(auth)
    if (!podeCriarNaArea(ator, v.dados.area_id)) return erro('Só o admin de POPs ou o dono da área cadastra roteiros.', 403)
    const id = body.id ? String(body.id) : undefined
    if (id) {
      if (!uuidValido(id)) return erro('Roteiro inválido.')
      const { data: atual } = await supabaseAdmin.from('pops_roteiros').select('area_id').eq('id', id).maybeSingle()
      if (!atual) return erro('Roteiro não encontrado.', 404)
      if (!podeCriarNaArea(ator, atual.area_id as string)) return erro('Sem permissão neste roteiro.', 403)
    }
    const salvo = await salvarModelo(v.dados, auth.userId, id)
    return NextResponse.json({ ok: true, id: salvo })
  } catch (e) { return falha(e) }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const id = String(body.id || '')
  if (!uuidValido(id) || typeof body.ativo !== 'boolean') return erro('Informe id e ativo.')
  try {
    const ator = await atorDe(auth)
    const { data: atual } = await supabaseAdmin.from('pops_roteiros').select('area_id').eq('id', id).maybeSingle()
    if (!atual) return erro('Roteiro não encontrado.', 404)
    if (!podeCriarNaArea(ator, atual.area_id as string)) return erro('Sem permissão neste roteiro.', 403)
    await ativarModelo(id, body.ativo)
    return NextResponse.json({ ok: true })
  } catch (e) { return falha(e) }
}
