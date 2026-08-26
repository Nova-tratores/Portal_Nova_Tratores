// Solicitações de Compra — listagem por visão + criação.
// GET  /api/decisoes?visao=fila|minhas|todas[&encerradas=1]
// POST /api/decisoes  { conta_omie, modelo, produto_codigo?, cliente_codigo?, pedido_venda_ref?, qtd_solicitada, preco_alvo?, justificativa }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloDecisoes, papeisDoUsuario, registrarDecisao, notificarDecisao, usuariosComPapel,
} from '@/lib/decisoes/server'
import { STATUS_FINAIS, type SolicitacaoCompra } from '@/lib/decisoes/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function mapaUsuarios(ids: string[]) {
  const unicos = [...new Set(ids)].filter(Boolean)
  if (unicos.length === 0) return {}
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', unicos)
  const mapa: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of data || []) mapa[u.id] = u
  return mapa
}

// Status que aparecem na "fila" de cada papel (a bola está com ele).
function statusDaFila(papeis: string[]): string[] {
  const s: string[] = []
  if (papeis.includes('diretoria_compras')) s.push('aguardando_diretoria')
  if (papeis.includes('financeiro')) s.push('aguardando_financeiro')
  if (papeis.includes('comprador')) s.push('aprovada')
  return s
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloDecisoes(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const visao = req.nextUrl.searchParams.get('visao') || 'fila'
  const incluirEncerradas = req.nextUrl.searchParams.get('encerradas') === '1'
  const finais = `(${STATUS_FINAIS.join(',')})`
  const papeis = papeisDoUsuario(auth)
  const fila = statusDaFila(papeis)

  // Contadores por aba (só SCs ativas).
  const contar = async (montar: () => PromiseLike<{ count: number | null }>) => (await montar()).count || 0
  const base = () => supabaseAdmin.from('solicitacoes_compra').select('id', { count: 'exact', head: true }).not('status', 'in', finais)
  const [cFila, cMinhas, cTodas] = await Promise.all([
    fila.length ? contar(() => base().in('status', fila)) : Promise.resolve(0),
    contar(() => base().eq('vendedor_id', auth.userId)),
    contar(() => base()),
  ])
  const contadores = { fila: cFila, minhas: cMinhas, todas: cTodas }

  let query = supabaseAdmin.from('solicitacoes_compra').select('*').order('ultima_atividade_em', { ascending: false }).limit(500)

  if (visao === 'minhas') {
    query = query.eq('vendedor_id', auth.userId)
  } else if (visao === 'fila') {
    if (fila.length === 0) return NextResponse.json({ solicitacoes: [], usuarios: {}, contadores })
    query = query.in('status', fila)
  } else if (visao === 'todas') {
    // todas — qualquer permissão do módulo já libera (transparência mútua)
  } else {
    return NextResponse.json({ error: 'Visão inválida' }, { status: 400 })
  }

  if (!incluirEncerradas) query = query.not('status', 'in', finais)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lista = (data || []) as SolicitacaoCompra[]
  const usuarios = await mapaUsuarios(lista.map((s) => s.vendedor_id))
  return NextResponse.json({ solicitacoes: lista, usuarios, contadores })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloDecisoes(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const papeis = papeisDoUsuario(auth)
  if (!papeis.includes('comercial') && !auth.isAdmin) {
    return NextResponse.json({ error: 'Só o Comercial pode abrir uma Solicitação de Compra.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const conta = String(body.conta_omie || 'NOVA').toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA'
  const modelo = String(body.modelo || '').trim()
  const produtoCodigo = String(body.produto_codigo || '').trim()
  const clienteCodigo = String(body.cliente_codigo || '').trim()
  const pvRef = String(body.pedido_venda_ref || '').trim()
  const qtd = Math.max(1, Math.floor(Number(body.qtd_solicitada) || 1))
  const precoAlvo = body.preco_alvo != null && body.preco_alvo !== '' ? Number(body.preco_alvo) : null
  const justificativa = String(body.justificativa || '').trim()

  if (!modelo) return NextResponse.json({ error: 'Informe o modelo/descrição da máquina' }, { status: 400 })
  if (!justificativa) return NextResponse.json({ error: 'Justifique a solicitação (fica registrado no livro de decisões)' }, { status: 400 })

  const { data: criada, error } = await supabaseAdmin
    .from('solicitacoes_compra')
    .insert({
      status: 'aguardando_diretoria',
      conta_omie: conta,
      vendedor_id: auth.userId,
      modelo,
      produto_codigo: produtoCodigo,
      cliente_codigo: clienteCodigo,
      pedido_venda_ref: pvRef,
      qtd_solicitada: qtd,
      qtd_atual: qtd,
      preco_alvo: precoAlvo,
    })
    .select('*')
    .single()
  if (error || !criada) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })

  const sc = criada as SolicitacaoCompra
  const erroLedger = await registrarDecisao({
    scId: sc.id, atorId: auth.userId, papel: 'comercial', tipo: 'sc_criada',
    justificativa,
    estadoNovo: { qtd, preco_alvo: precoAlvo, cliente: clienteCodigo, pedido_venda_ref: pvRef, modelo, conta },
    documentoRef: pvRef || null,
  })
  if (erroLedger) return NextResponse.json({ error: erroLedger }, { status: 500 })

  const diretoria = await usuariosComPapel('diretoria_compras')
  await notificarDecisao(sc, diretoria, auth.userId,
    `Nova SC #${sc.numero}: ${modelo}`,
    `${qtd}× — aguardando análise da diretoria de compras.`)

  return NextResponse.json({ solicitacao: sc })
}
