// GET /api/organograma/papeis — cargo, setor e "é líder" de cada usuário do portal, vindos do
// organograma (lib/organograma/papeis.ts). A Administração usa para mostrar "Larissa · Gerente ·
// Pós-vendas". Só admin. ?forcar=1 relê na hora (sem a memória de 5 min).
import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { papeisDoPortal } from '@/lib/organograma/papeis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Só administrador' }, { status: 403 })
  try {
    const mapa = await papeisDoPortal(req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json({ papeis: Object.fromEntries(mapa) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao ler o organograma' }, { status: 500 })
  }
}
