// POPs — detalhe e dados do cabeçalho que NÃO são versionados.
// GET   /api/pops/:id[?versao=<uuid>]  POP + versões visíveis + passos da versão escolhida
//       (padrão: a publicada; sem publicada, a mais recente visível) + papéis do usuário.
// PATCH /api/pops/:id  { titulo?, dono_id?, periodicidade_revisao_dias?, arquivado? }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  BUCKET_MIDIA, aprovadoresDaArea, atorDe, carregarPop, erro, erroBanco, passosDaVersao,
  urlsAssinadas, usuarioAtivo, usuariosMin, versoesDoPop,
} from '@/lib/pops/server'
import {
  ehAdminPops, podeAprovar, podeEditarPop, podeExecutar, podeVerRascunho, uuidValido,
} from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { id } = await params
  if (!uuidValido(id)) return erro('POP não encontrado', 404)
  try {
    const ator = await atorDe(auth)
    const pop = await carregarPop(id)
    if (!pop) return erro('POP não encontrado', 404)
    const verRasc = podeVerRascunho(ator, pop)
    const versoes = (await versoesDoPop(id)).filter((v) => verRasc || v.estado === 'publicado' || v.estado === 'obsoleto')
    if (!versoes.length) return erro('POP não encontrado', 404)

    const pedida = req.nextUrl.searchParams.get('versao')
    const versao = versoes.find((v) => v.id === pedida)
      || versoes.find((v) => v.estado === 'publicado') || versoes[0]
    const passos = await passosDaVersao(versao.id)
    const midias = await urlsAssinadas(BUCKET_MIDIA, passos.map((p) => p.midia_path as string))

    const [area, aprovadores, ciencia, agendamentos, modeloAtual] = await Promise.all([
      supabaseAdmin.from('pops_areas').select('id, sigla, nome').eq('id', pop.area_id).maybeSingle().then((r) => r.data),
      aprovadoresDaArea(pop.area_id),
      supabaseAdmin.from('pops_ciencias').select('ciente_em').eq('versao_id', versao.id).eq('usuario_id', auth.userId)
        .maybeSingle().then((r) => r.data),
      podeEditarPop(ator, pop)
        ? supabaseAdmin.from('pops_agendamentos').select('*').eq('pop_id', id).order('criado_em').then((r) => r.data || [])
        : Promise.resolve([]),
      // Aviso "o modelo de origem mudou desde a duplicação" (não propaga — só avisa).
      pop.origem_template_id
        ? supabaseAdmin.from('pops_versoes').select('numero').eq('pop_id', pop.origem_template_id).eq('estado', 'publicado')
            .maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ])
    // Versão em revisão: quem é a "bola" (para mostrar Aprovar/Reprovar a quem decide).
    const emRevisao = versoes.find((v) => v.estado === 'em_revisao' && v.revisao_ticket_id)
    const revisao = emRevisao
      ? await supabaseAdmin.from('tickets').select('id, responsavel_id').eq('id', emRevisao.revisao_ticket_id as string)
          .maybeSingle().then((r) => r.data && { ticket_id: r.data.id, responsavel_id: r.data.responsavel_id, versao_id: emRevisao.id })
      : null
    const usuarios = await usuariosMin([
      pop.dono_id, ...versoes.flatMap((v) => [v.submetido_por, v.aprovado_por]), ...aprovadores,
      ...agendamentos.map((a) => a.responsavel_padrao_id as string), revisao?.responsavel_id,
    ])

    return NextResponse.json({
      pop, area, versoes, versao,
      passos: passos.map((p) => ({ ...p, midia_url: p.midia_path ? midias[p.midia_path as string] || null : null })),
      aprovadores, agendamentos, usuarios, revisao,
      minha_ciencia: ciencia?.ciente_em || null,
      modelo_atualizado: !!(modeloAtual && pop.origem_template_versao && modeloAtual.numero > pop.origem_template_versao),
      papeis: {
        admin: ehAdminPops(ator),
        editar: podeEditarPop(ator, pop),
        aprovar: podeAprovar(ator, pop),
        executar: podeExecutar(ator, pop) && !pop.arquivado,
      },
    })
  } catch (e) {
    return erroBanco(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const ator = await atorDe(auth)
    const pop = await carregarPop(id)
    if (!pop) return erro('POP não encontrado', 404)
    if (!podeEditarPop(ator, pop)) return erro('Você não pode editar este POP.', 403)

    const patch: Record<string, unknown> = {}
    if ('titulo' in body) {
      const t = String(body.titulo || '').trim()
      if (!t || t.length > 160) return erro('Título obrigatório (até 160 caracteres).')
      patch.titulo = t
    }
    if ('periodicidade_revisao_dias' in body) {
      const n = Number(body.periodicidade_revisao_dias)
      if (!Number.isInteger(n) || n < 7 || n > 3650) return erro('Revisão entre 7 e 3650 dias.')
      patch.periodicidade_revisao_dias = n
    }
    if ('arquivado' in body) patch.arquivado = body.arquivado === true
    if ('dono_id' in body) {
      const d = String(body.dono_id || '')
      if (!ehAdminPops(ator) && pop.dono_id !== auth.userId) return erro('Só o dono atual ou o admin passa o POP adiante.', 403)
      if (!uuidValido(d) || !(await usuarioAtivo(d))) return erro('Dono inválido ou inativo.')
      patch.dono_id = d
    }
    if (!Object.keys(patch).length) return erro('Nada para alterar.')
    const { data, error } = await supabaseAdmin.from('pops').update(patch).eq('id', id).select('*').single()
    if (error) return erroBanco(error)
    return NextResponse.json({ pop: data })
  } catch (e) {
    return erroBanco(e)
  }
}
