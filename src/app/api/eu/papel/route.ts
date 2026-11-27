// GET /api/eu/papel — cargo, setor e se quem está logado é LÍDER (pelo cargo, organograma) ou DEV.
// A barra da Central usa para mostrar a aba "Minha equipe" só para líderes de setor e dev
// (José, 27/11/2026). Qualquer usuário logado pode perguntar sobre si mesmo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { papelDe } from '@/lib/organograma/papeis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const p = await papelDe(auth.userId).catch(() => ({ cargo: null, setor: null, lider: false }))
  return NextResponse.json({ ...p, dev: !!auth.isDev, veEquipe: p.lider || !!auth.isDev })
}
