// Lê horímetro ou chassi da foto no app (José, 22/10/2026): POST { imagem (data URL ou https), tipo }
// → { valor, certeza }. O app pergunta ao técnico antes de usar.
import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { corsAppMecanicos } from '@/lib/mecanicos/cors-app'
import { lerFoto } from '@/lib/mecanicos/relatorio-app-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsAppMecanicos(req, 'POST, OPTIONS') }) }

export async function POST(req: Request) {
  const cors = corsAppMecanicos(req, 'POST, OPTIONS')
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: cors })
  try {
    const b = await req.json().catch(() => ({}))
    const imagem = String(b?.imagem || '')
    const tipo = b?.tipo === 'chassi' ? 'chassi' : 'horimetro'
    if (!/^(data:image\/|https:\/\/)/.test(imagem)) return NextResponse.json({ error: 'Imagem inválida.' }, { status: 400, headers: cors })
    if (imagem.length > 12_000_000) return NextResponse.json({ error: 'Foto muito grande.' }, { status: 400, headers: cors })
    return NextResponse.json(await lerFoto(imagem, tipo), { headers: cors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors })
  }
}
