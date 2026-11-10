// GET /api/permissoes/modo — quem decide as permissões nas TELAS (usePermissoes).
// PERM_V2_TELAS no Railway: 'on' (padrão em produção desde 10/11/2026) = a v2 decide
// e a antiga vira a sombra; 'sombra' = a antiga decide (volta atrás sem deploy);
// 'off' = nada é comparado. Fora de produção é 'off' a menos que a env exista.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { modoV2 } from '@/lib/permissoes/sombra'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const env = process.env.PERM_V2_TELAS
  const telas = process.env.NODE_ENV !== 'production' && !env ? 'off' : modoV2(env)
  return NextResponse.json({ telas }, { headers: { 'Cache-Control': 'no-store' } })
}
