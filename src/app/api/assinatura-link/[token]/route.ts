// PÚBLICO: a pessoa grava a própria assinatura pelo link mandado no WhatsApp (José, 29/10/2026).
// O token (único, 7 dias, uso único) é conferido no servidor. GET = de quem é · POST {png} = grava.
import { NextRequest, NextResponse } from 'next/server'
import { lerLink, assinarPeloLink } from '@/lib/assinaturas/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const l = await lerLink(token).catch(() => null)
  if (!l) return NextResponse.json({ error: 'Link vencido ou já usado. Peça um novo.' }, { status: 404 })
  return NextResponse.json({ nome: l.nome })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const b = await req.json().catch(() => ({}))
  try { await assinarPeloLink(token, b.png); return NextResponse.json({ ok: true }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }
}
