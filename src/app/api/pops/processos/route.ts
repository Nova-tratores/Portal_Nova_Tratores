// POPs — Mapa de processos (sql/pops-04-mapa-processos.sql).
// GET   /api/pops/processos?arquivados=1   todo usuário logado lê (como os POPs publicados)
// POST  /api/pops/processos  { area_id, titulo, tela?, prioridade? }          admin do módulo ou dono da área
// PATCH /api/pops/processos  { id, titulo?, prioridade?, dono_id?, prazo?, observacao?, tela?, arquivado? }
//                            { id, acao: 'criar_pop' }   cria o POP (duplica o modelo, se houver) e liga
//                            { id, acao: 'vincular', pop_id | null }
// A situação de cada processo sai do POP ligado (lib/pops/processos.ts).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { atorDe, erro, erroBanco, rpc, usuarioAtivo } from '@/lib/pops/server'
import { ehAdminPops, podeCriarNaArea, uuidValido } from '@/lib/pops/regras'
import { atrasado, podeEditarProcesso, resumir, situacaoDoProcesso, validarEdicao } from '@/lib/pops/processos'
import { hojeSP } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const semTabela = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /pops_processos/.test(e.message || ''))
async function nomeDe(userId: string, email: string | null): Promise<string> {
  const { data } = await sb.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return (data?.nome as string) || email || userId
}
const MIGRATION = { migracaoFaltando: true, error: 'O mapa de processos ainda não existe no banco (falta aplicar sql/pops-04-mapa-processos.sql).' }

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const ator = await atorDe(auth)
    let q = sb.from('pops_processos').select('*').order('ordem').order('titulo')
    if (req.nextUrl.searchParams.get('arquivados') !== '1') q = q.eq('arquivado', false)
    const { data: procs, error } = await q
    if (semTabela(error)) return NextResponse.json({ ...MIGRATION, processos: [] }, { status: 503 })
    if (error) return erroBanco(error)
    const processos = (procs || []) as Row[]

    const [areas, usuarios] = await Promise.all([
      sb.from('pops_areas').select('id, sigla, nome, ativo').eq('ativo', true).order('sigla'),
      sb.from('financeiro_usu').select('id, nome, avatar_url, ativo').order('nome'),
    ])
    const popIds = [...new Set(processos.map((p) => p.pop_id).filter(Boolean))] as string[]
    const modelos = [...new Set(processos.map((p) => p.modelo_codigo).filter(Boolean))] as string[]
    const [pops, versoes, mods] = await Promise.all([
      popIds.length ? sb.from('pops').select('id, codigo, titulo, arquivado, area_id').in('id', popIds) : Promise.resolve({ data: [] as Row[] }),
      popIds.length ? sb.from('pops_versoes').select('pop_id, estado').in('pop_id', popIds) : Promise.resolve({ data: [] as Row[] }),
      modelos.length ? sb.from('pops').select('id, codigo').in('codigo', modelos) : Promise.resolve({ data: [] as Row[] }),
    ])
    const popPor = new Map((pops.data || []).map((p: Row) => [p.id, p]))
    const modeloPor = new Map((mods.data || []).map((m: Row) => [m.codigo, m.id]))
    const hoje = hojeSP()
    const lista = processos.map((p) => {
      const pop = p.pop_id ? popPor.get(p.pop_id) || null : null
      const estados = (versoes.data || []).filter((v: Row) => v.pop_id === p.pop_id).map((v: Row) => v.estado as string)
      const situacao = situacaoDoProcesso(pop as { arquivado: boolean } | null, estados)
      return {
        ...p, dono_id: (p.dono_id as string | null) ?? null, situacao, atrasado: atrasado(p.prazo, hoje, situacao),
        pop: pop ? { id: pop.id, codigo: pop.codigo, titulo: pop.titulo } : null,
        modelo: p.modelo_codigo && modeloPor.get(p.modelo_codigo) ? { id: modeloPor.get(p.modelo_codigo), codigo: p.modelo_codigo } : null,
        pode_editar: podeEditarProcesso(ator, p.area_id),
        pode_criar_pop: podeCriarNaArea(ator, p.area_id),
      }
    })
    return NextResponse.json({
      processos: lista, resumo: resumir(lista), hoje,
      areas: areas.data || [],
      usuarios: (usuarios.data || []).filter((u: Row) => u.ativo !== false).map((u: Row) => ({ id: u.id, nome: u.nome, avatar_url: u.avatar_url })),
      eu: { userId: auth.userId, admin: ehAdminPops(ator), areasQueEdito: (areas.data || []).filter((a: Row) => podeEditarProcesso(ator, a.id)).map((a: Row) => a.id) },
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
    const ator = await atorDe(auth)
    const area = String(body.area_id || '')
    if (!uuidValido(area)) return erro('Escolha a área.')
    if (!podeEditarProcesso(ator, area)) return erro('Só o admin de POPs ou o dono da área inclui processos.', 403)
    const v = validarEdicao({ titulo: body.titulo, prioridade: body.prioridade || 'media', tela: body.tela })
    if ('erro' in v) return erro(v.erro)
    const { data, error } = await sb.from('pops_processos')
      .insert({ area_id: area, ...v.campos, ordem: 999, atualizado_por: auth.userId }).select('id').single()
    if (semTabela(error)) return NextResponse.json(MIGRATION, { status: 503 })
    if (error) return error.code === '23505' ? erro('Já existe um processo com esse nome nesta área.') : erroBanco(error)
    await registrarAuditLog({ userId: auth.userId, userName: await nomeDe(auth.userId, auth.email), sistema: 'pops', acao: 'mapa_incluir', entidade: 'processo', entidadeId: data.id, entidadeLabel: String(v.campos.titulo) })
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (e) {
    return erroBanco(e)
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const ator = await atorDe(auth)
    const id = String(body.id || '')
    if (!uuidValido(id)) return erro('Processo inválido.')
    const { data: proc, error: e0 } = await sb.from('pops_processos').select('*').eq('id', id).maybeSingle()
    if (semTabela(e0)) return NextResponse.json(MIGRATION, { status: 503 })
    if (e0) return erroBanco(e0)
    if (!proc) return erro('Processo não encontrado.', 404)
    const nomeAutor = await nomeDe(auth.userId, auth.email)
    const audit = (acao: string, detalhes: Record<string, unknown>) => registrarAuditLog({
      userId: auth.userId, userName: nomeAutor, sistema: 'pops', acao, entidade: 'processo', entidadeId: id, entidadeLabel: proc.titulo, detalhes,
    })

    // ── Criar o POP do processo (duplica o modelo do sistema quando há) ──────
    if (body.acao === 'criar_pop') {
      if (proc.pop_id) return erro('Este processo já tem POP ligado.')
      if (!podeCriarNaArea(ator, proc.area_id)) return erro('Só o dono de POPs da área (ou o admin do módulo) cria o POP.', 403)
      // Dono do POP: o dono do processo, se ativo e se eu posso nomear outra pessoa; senão eu.
      let dono = auth.userId
      if (proc.dono_id && proc.dono_id !== auth.userId && (await usuarioAtivo(proc.dono_id))
        && (ehAdminPops(ator) || ator.papeisArea.some((p) => p.area_id === proc.area_id))) dono = proc.dono_id
      let criado: { pop_id: string; codigo: string }
      const modelo = proc.modelo_codigo
        ? (await sb.from('pops').select('id').eq('codigo', proc.modelo_codigo).maybeSingle()).data
        : null
      if (modelo) {
        criado = await rpc('pops_duplicar', { p_origem: modelo.id, p_area: proc.area_id, p_dono: dono, p_autor: auth.userId, p_titulo: proc.titulo })
      } else {
        criado = await rpc('pops_criar', { p_area: proc.area_id, p_titulo: proc.titulo, p_dono: dono, p_autor: auth.userId, p_template_tipo: null, p_periodicidade: 365 })
      }
      await sb.from('pops_processos').update({ pop_id: criado.pop_id, atualizado_em: new Date().toISOString(), atualizado_por: auth.userId }).eq('id', id)
      await audit('mapa_criar_pop', { pop: criado.codigo, a_partir_de: modelo ? proc.modelo_codigo : null })
      return NextResponse.json({ pop_id: criado.pop_id, codigo: criado.codigo }, { status: 201 })
    }

    if (!podeEditarProcesso(ator, proc.area_id)) return erro('Só o admin de POPs ou o dono da área mexe neste processo.', 403)

    // ── Ligar a um POP que já existe (ou desligar) ──────────────────────────
    if (body.acao === 'vincular') {
      const popId = body.pop_id ? String(body.pop_id) : null
      if (popId) {
        if (!uuidValido(popId)) return erro('POP inválido.')
        const { data: p } = await sb.from('pops').select('id, codigo, template_tipo').eq('id', popId).maybeSingle()
        if (!p) return erro('POP não encontrado.', 404)
        if (p.template_tipo === 'sistema') return erro('Modelo do sistema não é o POP do processo: crie um POP a partir dele.')
      }
      await sb.from('pops_processos').update({ pop_id: popId, atualizado_em: new Date().toISOString(), atualizado_por: auth.userId }).eq('id', id)
      await audit('mapa_vincular', { de: proc.pop_id, para: popId })
      return NextResponse.json({ ok: true })
    }

    // ── Editar campos ───────────────────────────────────────────────────────
    const v = validarEdicao(body)
    if ('erro' in v) return erro(v.erro)
    if (!Object.keys(v.campos).length) return erro('Nada para mudar.')
    if (v.campos.dono_id && (!uuidValido(v.campos.dono_id) || !(await usuarioAtivo(String(v.campos.dono_id))))) return erro('Dono inválido ou inativo.')
    const { error } = await sb.from('pops_processos').update({ ...v.campos, atualizado_em: new Date().toISOString(), atualizado_por: auth.userId }).eq('id', id)
    if (error) return error.code === '23505' ? erro('Já existe um processo com esse nome nesta área.') : erroBanco(error)
    const de = Object.fromEntries(Object.keys(v.campos).map((k) => [k, proc[k] ?? null]))
    await audit('mapa_editar', { de, para: v.campos })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return erroBanco(e)
  }
}

