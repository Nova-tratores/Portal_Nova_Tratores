// POPs — lista e criação.
// GET  /api/pops?area=<uuid>&q=&templates=1&arquivados=1&offset=0
//      Qualquer usuário logado lê POP com versão publicada; rascunho só quem
//      edita/aprova na área (ou admin do módulo).
// POST /api/pops  { area_id, titulo, dono_id?, periodicidade_revisao_dias?, template? }
//      Cria o POP com a v1 em rascunho. Dono da área ou admin; modelo do sistema só admin.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, erro, erroBanco, rpc, usuarioAtivo, usuariosMin, type PopRow } from '@/lib/pops/server'
import { ehAdminPops, podeCriarNaArea, podeVerRascunho, uuidValido } from '@/lib/pops/regras'
import { hojeSP } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGINA = 200

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const ator = await atorDe(auth)
    const sp = req.nextUrl.searchParams
    const offset = Math.max(0, Number(sp.get('offset')) || 0)
    let q = supabaseAdmin.from('pops').select('*', { count: 'exact' })
      .order('codigo', { ascending: true }).range(offset, offset + PAGINA - 1)
    const area = sp.get('area')
    if (area && uuidValido(area)) q = q.eq('area_id', area)
    if (sp.get('templates') === '1') q = q.eq('eh_template', true)
    else q = q.or('template_tipo.is.null,template_tipo.neq.sistema')
    if (sp.get('arquivados') !== '1') q = q.eq('arquivado', false)
    const busca = (sp.get('q') || '').trim().replace(/[%,()]/g, ' ')
    if (busca) q = q.or(`titulo.ilike.%${busca}%,codigo.ilike.%${busca}%`)
    const { data, error, count } = await q
    if (error) return erroBanco(error)
    const pops = (data || []) as PopRow[]

    const ids = pops.map((p) => p.id)
    const versoes = ids.length
      ? (await supabaseAdmin.from('pops_versoes').select('pop_id, id, numero, estado')
          .in('pop_id', ids).in('estado', ['publicado', 'rascunho', 'em_revisao']).order('numero')).data || []
      : []
    const hoje = hojeSP()
    const lista = pops.flatMap((p) => {
      const vs = versoes.filter((v) => v.pop_id === p.id)
      const publicada = vs.find((v) => v.estado === 'publicado') || null
      const verRasc = podeVerRascunho(ator, p)
      if (!publicada && !verRasc) return []
      const edicao = verRasc ? vs.find((v) => v.estado !== 'publicado') || null : null
      return [{
        ...p,
        publicada: publicada && { id: publicada.id, numero: publicada.numero },
        edicao: edicao && { id: edicao.id, numero: edicao.numero, estado: edicao.estado },
        revisao_vencida: !!publicada && !!p.proxima_revisao_em && p.proxima_revisao_em < hoje,
      }]
    })
    const usuarios = await usuariosMin(lista.map((p) => p.dono_id))
    return NextResponse.json({ pops: lista, total: count ?? lista.length, offset, pagina: PAGINA, usuarios })
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
    const areaId = String(body.area_id || '')
    if (!uuidValido(areaId)) return erro('Escolha a área.')
    const template = body.template === true
    if (template ? !ehAdminPops(ator) : !podeCriarNaArea(ator, areaId)) {
      return erro(template ? 'Só o admin do módulo cria modelos do sistema.' : 'Você não é dono de POPs desta área.', 403)
    }
    const titulo = String(body.titulo || '').trim()
    if (!titulo || titulo.length > 160) return erro('Título obrigatório (até 160 caracteres).')
    const dono = body.dono_id ? String(body.dono_id) : auth.userId
    if (!uuidValido(dono) || !(await usuarioAtivo(dono))) return erro('Dono inválido ou inativo.')
    if (dono !== auth.userId && !ehAdminPops(ator) && !ator.papeisArea.some((p) => p.area_id === areaId)) {
      return erro('Só o admin do módulo define outro dono.', 403)
    }
    const periodicidade = body.periodicidade_revisao_dias ? Number(body.periodicidade_revisao_dias) : 365
    if (!Number.isInteger(periodicidade) || periodicidade < 7 || periodicidade > 3650) return erro('Revisão entre 7 e 3650 dias.')

    const criado = await rpc<{ pop_id: string; versao_id: string; codigo: string }>('pops_criar', {
      p_area: areaId, p_titulo: titulo, p_dono: dono, p_autor: auth.userId,
      p_template_tipo: template ? 'sistema' : null, p_periodicidade: periodicidade,
    })
    return NextResponse.json(criado, { status: 201 })
  } catch (e) {
    return erroBanco(e)
  }
}
