// Departamentos do Opa (sql/opa-departamentos.sql): cada local (pni_locais) aponta para um
// departamento e cada departamento tem um gestor — o gestor vira o Responsável do Opa e é o
// único avisado (/api/opa/notificar). Ler = qualquer pessoa logada; mudar = admin.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { validarNomeDepartamento } from '@/lib/opa/departamentos'

export const dynamic = 'force-dynamic'

const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
const MIGRACAO = { error: 'Falta aplicar o sql/opa-departamentos.sql no banco.', migracaoFaltando: true }

async function nomeDe(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return (data?.nome as string) || 'Usuário'
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 })
  const [deps, ligs, locais, usuarios] = await Promise.all([
    supabaseAdmin.from('opa_departamentos').select('id, nome, gestor_id, gestor_nome, padrao, ativo, ordem').eq('ativo', true).order('ordem').order('nome'),
    supabaseAdmin.from('opa_local_departamento').select('local_id, departamento_id'),
    supabaseAdmin.from('pni_locais').select('*').order('ordem'),
    auth.isAdmin
      ? supabaseAdmin.from('financeiro_usu').select('id, nome').eq('ativo', true).order('nome')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (semTabela(deps.error) || semTabela(ligs.error)) return NextResponse.json(MIGRACAO, { status: 503 })
  const erro = deps.error || ligs.error || locais.error || usuarios.error
  if (erro) return NextResponse.json({ error: erro.message }, { status: 500 })
  return NextResponse.json({
    departamentos: deps.data || [],
    ligacoes: ligs.data || [],
    locais: locais.data || [],
    usuarios: ((usuarios.data || []) as { id: string; nome: string | null }[]).filter((u) => u.nome && !/teste/i.test(u.nome)),
    podeEditar: auth.isAdmin,
  })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 })
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só admin configura os departamentos do Opa.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const acao = String(body.acao || '')
  const autor = await nomeDe(auth.userId)
  const log = (acao: string, label: string, detalhes: Record<string, unknown>) =>
    registrarAuditLog({ userId: auth.userId, userName: autor, sistema: 'opa', acao, entidade: 'departamento', entidadeLabel: label, detalhes }).catch(() => {})

  // gestor = usuário do portal; o nome é retratado (vai no Responsável do Opa)
  async function gestor(id: unknown): Promise<{ gestor_id: string | null; gestor_nome: string | null } | NextResponse> {
    if (id === null || id === '' || id === undefined) return { gestor_id: null, gestor_nome: null }
    const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').eq('id', String(id)).maybeSingle()
    if (!data || data.ativo === false) return NextResponse.json({ error: 'Gestor não encontrado entre os usuários ativos.' }, { status: 400 })
    return { gestor_id: data.id as string, gestor_nome: (data.nome as string) || null }
  }

  if (acao === 'salvar_departamento') {
    const nome = String(body.nome ?? '').replace(/\s+/g, ' ').trim()
    const erroNome = validarNomeDepartamento(nome)
    if (erroNome) return NextResponse.json({ error: erroNome }, { status: 400 })
    const g = await gestor(body.gestor_id)
    if (g instanceof NextResponse) return g
    const id = body.id ? String(body.id) : null
    const campos = { nome, ...g, atualizado_em: new Date().toISOString() }
    const { data, error } = id
      ? await supabaseAdmin.from('opa_departamentos').update(campos).eq('id', id).select().single()
      : await supabaseAdmin.from('opa_departamentos').insert(campos).select().single()
    if (semTabela(error)) return NextResponse.json(MIGRACAO, { status: 503 })
    if (error) {
      const dup = error.code === '23505'
      return NextResponse.json({ error: dup ? `Já existe um departamento "${nome}".` : error.message }, { status: dup ? 409 : 500 })
    }
    await log(id ? 'editar' : 'criar', nome, { gestor: g.gestor_nome })
    return NextResponse.json({ ok: true, departamento: data })
  }

  if (acao === 'padrao') {
    // um só padrão: tira dos outros, depois marca este
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    const r1 = await supabaseAdmin.from('opa_departamentos').update({ padrao: false }).eq('padrao', true).neq('id', id)
    if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })
    const { data, error } = await supabaseAdmin.from('opa_departamentos').update({ padrao: true }).eq('id', id).select('nome').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await log('padrao', data.nome as string, {})
    return NextResponse.json({ ok: true })
  }

  if (acao === 'remover_departamento') {
    const id = String(body.id || '')
    const { data: d } = await supabaseAdmin.from('opa_departamentos').select('nome, padrao').eq('id', id).maybeSingle()
    if (!d) return NextResponse.json({ error: 'Departamento não encontrado.' }, { status: 404 })
    if (d.padrao) return NextResponse.json({ error: 'Escolha outro departamento como padrão antes de remover este.' }, { status: 409 })
    // os locais dele voltam a "sem departamento" (caem no padrão); o Opa antigo guarda o nome
    const r1 = await supabaseAdmin.from('opa_local_departamento').delete().eq('departamento_id', id)
    if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })
    const { error } = await supabaseAdmin.from('opa_departamentos').update({ ativo: false, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await log('remover', d.nome as string, {})
    return NextResponse.json({ ok: true })
  }

  if (acao === 'ligar_local') {
    const localId = String(body.local_id || '')
    const depId = body.departamento_id ? String(body.departamento_id) : null
    if (!localId) return NextResponse.json({ error: 'local_id obrigatório' }, { status: 400 })
    const { error } = depId
      ? await supabaseAdmin.from('opa_local_departamento').upsert({ local_id: localId, departamento_id: depId, atualizado_em: new Date().toISOString(), atualizado_por: autor })
      : await supabaseAdmin.from('opa_local_departamento').delete().eq('local_id', localId)
    if (semTabela(error)) return NextResponse.json(MIGRACAO, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await log('ligar_local', localId, { departamento_id: depId })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
}
