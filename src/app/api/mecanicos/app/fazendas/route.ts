// Fazendas (localizações confirmadas) do cliente da OS, para o "Onde foi o serviço" do app: GET ?os=OS-0850
import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { corsAppMecanicos } from '@/lib/mecanicos/cors-app'
import { fazendasDaOS } from '@/lib/mecanicos/relatorio-app-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsAppMecanicos(req) }) }

export async function GET(req: Request) {
  const cors = corsAppMecanicos(req)
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: cors })
  try {
    return NextResponse.json(await fazendasDaOS(String(new URL(req.url).searchParams.get('os') || '')), { headers: cors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400, headers: cors })
  }
}
