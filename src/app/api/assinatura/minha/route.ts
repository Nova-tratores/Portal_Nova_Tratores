// A assinatura salva de quem está logado (para pedir/autorizar a comissão sem desenhar de novo) — José, 29/10/2026.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { lerAssinatura } from '@/lib/assinaturas/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const a = await autenticar(req)
  if (!a) return NextResponse.json({ error: 'Sem login' }, { status: 401 })
  try { return NextResponse.json({ assinatura: await lerAssinatura(a.userId) }) }
  catch (e) { return NextResponse.json({ assinatura: null, error: e instanceof Error ? e.message : String(e) }) }
}
