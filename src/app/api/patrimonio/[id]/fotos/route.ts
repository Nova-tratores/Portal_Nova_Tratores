import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { adicionarFotos, removerFoto, semMigracao } from '@/lib/patrimonio/db-server'
import { BUCKET_PATRIMONIO, caminhoFotoValido } from '@/lib/patrimonio/fotos-regra'

export const dynamic = 'force-dynamic'

// Fotos de um item do Patrimônio Loja.
// POST   { paths: string[] } → anexa (fotos já enviadas ao bucket pelo navegador)
// DELETE ?foto=<id>         → tira a foto (e apaga o arquivo + miniatura)

function erro(e: unknown) {
  const err = e as { code?: string; message?: string }
  if (semMigracao(err)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta rodar o sql/patrimonio-01.sql no banco.' }, { status: 503 })
  return NextResponse.json({ ok: false, erro: err?.message || String(e) }, { status: 500 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const { id } = await params
  const body = await req.json().catch(() => null) as { paths?: unknown[] } | null
  const paths = (body?.paths || []).filter((p): p is string => caminhoFotoValido(p, acesso.user.id)).slice(0, 12)
  if (!paths.length) return NextResponse.json({ ok: false, erro: 'Nenhuma foto válida.' }, { status: 400 })
  try {
    await adicionarFotos(id, paths)
    return NextResponse.json({ ok: true })
  } catch (e) { return erro(e) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const { id } = await params
  const fotoId = req.nextUrl.searchParams.get('foto') || ''
  if (!fotoId) return NextResponse.json({ ok: false, erro: 'Informe a foto.' }, { status: 400 })
  try {
    const path = await removerFoto(id, fotoId)
    if (path) await supabaseAdmin.storage.from(BUCKET_PATRIMONIO).remove([path, path.replace(/\.jpg$/i, '_mini.jpg')]).catch(() => null)
    return NextResponse.json({ ok: true })
  } catch (e) { return erro(e) }
}
