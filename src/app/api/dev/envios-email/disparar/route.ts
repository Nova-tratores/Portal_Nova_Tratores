import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { parseDestinatarios } from '@/lib/dre-financeiro/email'
import { dispararEnvio } from '@/lib/email/envios-disparo'

// "Enviar agora" (pros destinatários configurados) ou "Enviar teste" (só pro
// e-mail informado). SÓ Dev. pdfkit exige runtime Node.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// body: { chave, teste?: "a@b.com, c@d.com" }
export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })
  if (!auth.isDev) return NextResponse.json({ error: 'só Dev pode disparar envios' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const chave = String(body?.chave || '')
    const teste = parseDestinatarios(body?.teste)
    const resultado = await dispararEnvio({
      chave,
      origem: teste.length ? 'teste' : 'manual',
      destinatariosTeste: teste,
      usuario: auth.email || auth.userId,
    })
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
