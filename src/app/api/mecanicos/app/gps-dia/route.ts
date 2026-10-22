// GPS do dia para o relatório da OS no app (José, 22/10/2026): GET ?os=OS-0850&data=2026-10-21
// → { placa, carroDe, chegada, saida, kmDia, fazenda, aviso }. É sugestão: o técnico confirma no app.
import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { corsAppMecanicos } from '@/lib/mecanicos/cors-app'
import { gpsDoDia, tecnicoDoUsuario } from '@/lib/mecanicos/relatorio-app-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsAppMecanicos(req) }) }

export async function GET(req: Request) {
  const cors = corsAppMecanicos(req)
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: cors })
  const u = new URL(req.url)
  try {
    const r = await gpsDoDia(String(u.searchParams.get('os') || ''), String(u.searchParams.get('data') || ''), await tecnicoDoUsuario(auth.userId))
    return NextResponse.json(r, { headers: cors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400, headers: cors })
  }
}
