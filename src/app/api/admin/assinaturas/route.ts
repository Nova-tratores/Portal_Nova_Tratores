// Assinatura salva das pessoas (José, 29/10/2026) — só admin. GET ?user_id · POST {user_id, png} grava ·
// POST {user_id, acao:'link'} gera o link para assinar pelo celular · DELETE ?user_id apaga.
import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { lerAssinatura, gravarAssinatura, apagarAssinatura, criarLink } from '@/lib/assinaturas/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (e: unknown, status = 500) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })

export async function GET(req: NextRequest) {
  const a = await exigirAdmin(req)
  if (!a) return NextResponse.json({ error: 'Só admin' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('user_id') || ''
  if (!id) return erro('Falta o usuário', 400)
  try { return NextResponse.json({ assinatura: await lerAssinatura(id) }) } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const a = await exigirAdmin(req)
  if (!a) return NextResponse.json({ error: 'Só admin' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.user_id || '')
  if (!id) return erro('Falta o usuário', 400)
  try {
    if (b.acao === 'link') {
      const token = await criarLink(id, a.email || a.userId)
      return NextResponse.json({ url: `${req.nextUrl.origin}/assinatura/${token}` })
    }
    await gravarAssinatura(id, b.png, 'admin', a.email || a.userId)
    return NextResponse.json({ ok: true })
  } catch (e) { return erro(e, 400) }
}

export async function DELETE(req: NextRequest) {
  const a = await exigirAdmin(req)
  if (!a) return NextResponse.json({ error: 'Só admin' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('user_id') || ''
  if (!id) return erro('Falta o usuário', 400)
  try { await apagarAssinatura(id); return NextResponse.json({ ok: true }) } catch (e) { return erro(e) }
}
