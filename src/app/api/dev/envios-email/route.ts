import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { listarEnviosPainel, salvarConfigEnvio, envioDef } from '@/lib/email/envios-config'

// Tela Dev → Envios de e-mail. SÓ Dev (is_dev) lê/edita.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function exigirDev(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return { erro: NextResponse.json({ error: 'não autenticado' }, { status: 401 }) }
  if (!auth.isDev) return { erro: NextResponse.json({ error: 'só Dev pode acessar os envios de e-mail' }, { status: 403 }) }
  return { auth }
}

// GET — catálogo + config + histórico
export async function GET(req: NextRequest) {
  const g = await exigirDev(req)
  if (g.erro) return g.erro
  try {
    return NextResponse.json(await listarEnviosPainel())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}

// PUT — salva a config de UM envio. body: { chave, ativo?, to?, cc?, bcc?, parametros? }
export async function PUT(req: NextRequest) {
  const g = await exigirDev(req)
  if (g.erro) return g.erro
  try {
    const body = await req.json().catch(() => ({}))
    const chave = String(body?.chave || '')
    if (!envioDef(chave)) return NextResponse.json({ error: 'envio desconhecido' }, { status: 400 })
    const parametros = body?.parametros && typeof body.parametros === 'object' ? body.parametros : undefined
    const cfg = await salvarConfigEnvio(chave, {
      ativo: typeof body?.ativo === 'boolean' ? body.ativo : undefined,
      to: body?.to,
      cc: body?.cc,
      bcc: body?.bcc,
      parametros,
    }, g.auth!.email || g.auth!.userId)
    return NextResponse.json({ ok: true, config: cfg })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
