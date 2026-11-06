// Opa → Mapa (sql/opa-mapa.sql): planta da loja por andar + onde fica cada lugar (pni_locais),
// com o departamento/gestor (sql/opa-departamentos.sql) e os Opas abertos de cada lugar.
// Ler = qualquer pessoa logada; desenhar = admin ou a ação explícita opa:mapa.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { permite } from '@/lib/permissoes/explicitas'
import { idUnico, limitarRet, validarBlocos, validarForma, type Andar } from '@/lib/opa/mapa'

export const dynamic = 'force-dynamic'

const podeDesenhar = (a: { modulos: string[]; isAdmin: boolean; isDev: boolean }) =>
  permite(a.modulos, a.isAdmin, 'opa', 'mapa', a.isDev)

const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
const MIGRACAO = { error: 'Falta aplicar o sql/opa-mapa.sql no banco.', migracaoFaltando: true }

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 })
  const [andares, posicoes, locais, deps, ligs, opas] = await Promise.all([
    supabaseAdmin.from('opa_mapa_andares').select('id, nome, ordem, blocos, ativo').order('ordem'),
    // '*': forma/pontos só existem depois do sql/opa-locais-setor-formas.sql
    supabaseAdmin.from('opa_local_mapa').select('*'),
    supabaseAdmin.from('pni_locais').select('*').order('ordem'),
    supabaseAdmin.from('opa_departamentos').select('id, nome, gestor_id, gestor_nome, padrao, ativo, ordem').eq('ativo', true).order('ordem').order('nome'),
    supabaseAdmin.from('opa_local_departamento').select('local_id, departamento_id'),
    supabaseAdmin.from('portal_opas').select('id, titulo, local, responsavel, created_at').eq('status', 'aberto'),
  ])
  if (semTabela(andares.error) || semTabela(posicoes.error)) return NextResponse.json(MIGRACAO, { status: 503 })
  const erro = andares.error || posicoes.error || locais.error
  if (erro) return NextResponse.json({ error: erro.message }, { status: 500 })
  return NextResponse.json({
    andares: (andares.data || []).map((a) => ({ ...a, blocos: Array.isArray(a.blocos) ? a.blocos : [] })),
    posicoes: (posicoes.data || []).map((p) => ({
      local_id: p.local_id, andar_id: p.andar_id, x: Number(p.x), y: Number(p.y), w: Number(p.w), h: Number(p.h),
      ...validarForma(p.forma, p.pontos),
    })),
    locais: locais.data || [],
    // departamentos são opcionais (outra migration): sem eles o mapa só não pinta
    departamentos: deps.error ? [] : deps.data || [],
    ligacoes: ligs.error ? [] : ligs.data || [],
    opas: opas.error ? [] : opas.data || [],
    podeEditar: podeDesenhar(auth),
  })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 })
  if (!podeDesenhar(auth)) return NextResponse.json({ error: 'Sem permissão para desenhar o mapa (Admin → Opa → Desenhar o mapa).' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const acao = String(body.acao || '')
  const { data: u } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle()
  const autor = (u?.nome as string) || 'Usuário'
  const agora = new Date().toISOString()
  const log = (acao: string, label: string, detalhes: Record<string, unknown> = {}) =>
    registrarAuditLog({ userId: auth.userId, userName: autor, sistema: 'opa', acao, entidade: 'mapa', entidadeLabel: label, detalhes }).catch(() => {})
  const responder = (error: { code?: string; message: string } | null) => {
    if (semTabela(error)) return NextResponse.json(MIGRACAO, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return null
  }

  if (acao === 'posicionar') {
    // põe (ou move/redimensiona) um lugar num andar
    const localId = String(body.local_id || ''), andarId = String(body.andar_id || '')
    if (!localId || !andarId) return NextResponse.json({ error: 'local e andar obrigatórios' }, { status: 400 })
    const r = limitarRet(body as Record<string, number>)
    // forma só vem quando muda (desenhou ou trocou a forma); mover/redimensionar não mexe nela
    const forma = body.forma !== undefined ? validarForma(body.forma, body.pontos) : null
    const { error } = await supabaseAdmin.from('opa_local_mapa')
      .upsert({ local_id: localId, andar_id: andarId, ...r, ...(forma || {}), atualizado_em: agora, atualizado_por: autor })
    if (forma && error && (error.code === '42703' || error.code === 'PGRST204' || /column/i.test(error.message))) {
      return NextResponse.json({ error: 'Para salvar a forma falta rodar o sql/opa-locais-setor-formas.sql no banco do portal.', migracaoFaltando: true }, { status: 503 })
    }
    const falha = responder(error); if (falha) return falha
    await log('posicionar', localId, { andar: andarId, ...r, ...(forma || {}) })
    return NextResponse.json({ ok: true, posicao: { local_id: localId, andar_id: andarId, ...r, ...(forma || {}) } })
  }

  if (acao === 'editar_local') {
    // nome e setor do lugar ("W/C Oficina" → setor Oficina, nome Banheiro)
    const localId = String(body.local_id || '')
    const nome = String(body.nome ?? '').replace(/\s+/g, ' ').trim()
    const setor = String(body.setor ?? '').replace(/\s+/g, ' ').trim()
    if (!localId || !nome || nome.length > 60) return NextResponse.json({ error: 'Nome do lugar de 1 a 60 letras.' }, { status: 400 })
    if (setor.length > 40) return NextResponse.json({ error: 'Setor com mais de 40 letras.' }, { status: 400 })
    const { error } = await supabaseAdmin.from('pni_locais').update({ nome, setor: setor || null }).eq('id', localId)
    if (error && (error.code === '42703' || error.code === 'PGRST204' || /setor/i.test(error.message))) {
      return NextResponse.json({ error: 'Para dar setor ao lugar falta rodar o sql/opa-locais-setor-formas.sql no banco do portal.', migracaoFaltando: true }, { status: 503 })
    }
    const falha = responder(error); if (falha) return falha
    await log('editar_local', localId, { nome, setor })
    return NextResponse.json({ ok: true })
  }

  if (acao === 'tirar_do_mapa') {
    const localId = String(body.local_id || '')
    const { error } = await supabaseAdmin.from('opa_local_mapa').delete().eq('local_id', localId)
    const falha = responder(error); if (falha) return falha
    await log('tirar_do_mapa', localId)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'salvar_blocos') {
    // a planta do andar (áreas/paredes): a tela manda a lista inteira
    const andarId = String(body.andar_id || '')
    const blocos = validarBlocos(body.blocos)
    if (typeof blocos === 'string') return NextResponse.json({ error: blocos }, { status: 400 })
    const { error } = await supabaseAdmin.from('opa_mapa_andares')
      .update({ blocos, atualizado_em: agora, atualizado_por: autor }).eq('id', andarId)
    const falha = responder(error); if (falha) return falha
    await log('salvar_blocos', andarId, { blocos: blocos.length })
    return NextResponse.json({ ok: true, blocos })
  }

  if (acao === 'criar_andar' || acao === 'renomear_andar') {
    const nome = String(body.nome ?? '').replace(/\s+/g, ' ').trim()
    if (!nome || nome.length > 40) return NextResponse.json({ error: 'Nome do andar de 1 a 40 letras.' }, { status: 400 })
    if (acao === 'renomear_andar') {
      const { error } = await supabaseAdmin.from('opa_mapa_andares').update({ nome, atualizado_em: agora, atualizado_por: autor }).eq('id', String(body.id || ''))
      const falha = responder(error); if (falha) return falha
      await log('renomear_andar', nome)
      return NextResponse.json({ ok: true })
    }
    const { data: atuais, error: e1 } = await supabaseAdmin.from('opa_mapa_andares').select('id, ordem')
    const falha1 = responder(e1); if (falha1) return falha1
    const lista = (atuais || []) as Pick<Andar, 'id' | 'ordem'>[]
    const andar = { id: idUnico(nome, lista.map((a) => a.id)), nome, ordem: Math.max(-1, ...lista.map((a) => a.ordem)) + 1, blocos: [], atualizado_por: autor }
    const { error } = await supabaseAdmin.from('opa_mapa_andares').insert(andar)
    const falha = responder(error); if (falha) return falha
    await log('criar_andar', nome)
    return NextResponse.json({ ok: true, andar: { ...andar, ativo: true } })
  }

  if (acao === 'remover_andar') {
    // só andar vazio (sem lugar posicionado) e nunca o último
    const id = String(body.id || '')
    const [{ count }, { data: ativos }] = await Promise.all([
      supabaseAdmin.from('opa_local_mapa').select('local_id', { count: 'exact', head: true }).eq('andar_id', id),
      supabaseAdmin.from('opa_mapa_andares').select('id').eq('ativo', true),
    ])
    if ((count || 0) > 0) return NextResponse.json({ error: 'Tire os lugares deste andar do mapa antes de remover.' }, { status: 409 })
    if ((ativos || []).length <= 1) return NextResponse.json({ error: 'O mapa precisa de pelo menos um andar.' }, { status: 409 })
    const { error } = await supabaseAdmin.from('opa_mapa_andares').update({ ativo: false, atualizado_em: agora, atualizado_por: autor }).eq('id', id)
    const falha = responder(error); if (falha) return falha
    await log('remover_andar', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
}
