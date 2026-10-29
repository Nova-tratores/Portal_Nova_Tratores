import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { normalizarLayout } from '@/lib/opa-pecas/etiqueta-termica'
import { apagarModelo, atualizarModelo, criarModelo, listarModelos, ModelosSemMigracao, nomeModelo } from '@/lib/etiquetas/modelos-server'
import { ACESSO_ETIQUETAS } from '../estacao/acesso'

export const dynamic = 'force-dynamic'

// Modelos (padrões) da etiqueta térmica.
// GET  → { modelos, podeEditar }                      (quem tem acesso às etiquetas)
// POST { acao: 'criar', nome, layout }                 (admin/dev)
// POST { acao: 'atualizar', id, nome?, layout? }
// POST { acao: 'apagar', id }

function erro(e: unknown) {
  if (e instanceof ModelosSemMigracao) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: e.message }, { status: 503 })
  return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_ETIQUETAS)
  if (g.resposta) return g.resposta
  try { return NextResponse.json({ ok: true, modelos: await listarModelos(), podeEditar: g.user.isAdmin }) }
  catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_ETIQUETAS)
  if (g.resposta) return g.resposta
  if (!g.user.isAdmin) return NextResponse.json({ ok: false, erro: 'Só administradores mudam os modelos de etiqueta.' }, { status: 403 })
  const autor = { id: g.user.id, nome: g.user.nome || g.user.email || '—' }
  const b = await req.json().catch(() => null) as { acao?: string; id?: unknown; nome?: unknown; layout?: unknown } | null
  const id = Number(b?.id)
  const precisaId = b?.acao === 'atualizar' || b?.acao === 'apagar'
  if (precisaId && (!Number.isInteger(id) || id <= 0)) return NextResponse.json({ ok: false, erro: 'Modelo inválido.' }, { status: 400 })
  try {
    if (b?.acao === 'apagar') { await apagarModelo(id); return NextResponse.json({ ok: true }) }
    const nome = b?.nome !== undefined ? nomeModelo(b.nome) : undefined
    if (typeof nome === 'object') return NextResponse.json({ ok: false, erro: nome.erro }, { status: 400 })
    const layout = b?.layout !== undefined ? normalizarLayout(b.layout) : undefined
    if (layout === null) return NextResponse.json({ ok: false, erro: 'Layout inválido.' }, { status: 400 })
    if (b?.acao === 'criar') {
      if (!nome || !layout) return NextResponse.json({ ok: false, erro: 'Informe nome e layout.' }, { status: 400 })
      return NextResponse.json({ ok: true, modelo: await criarModelo(nome, layout, autor) })
    }
    if (b?.acao === 'atualizar') {
      if (!nome && !layout) return NextResponse.json({ ok: false, erro: 'Nada para mudar.' }, { status: 400 })
      await atualizarModelo(id, { ...(nome ? { nome } : {}), ...(layout ? { layout } : {}) }, autor)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, erro: 'Ação inválida.' }, { status: 400 })
  } catch (e) { return erro(e) }
}
