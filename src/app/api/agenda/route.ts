// AGENDA COLETIVA — GET /api/agenda?de=YYYY-MM-DD&ate=YYYY-MM-DD&modo=coletiva|tecnicos
// -> { pessoas, itens, agora, eu, admin, podeLousa, avisos, migracaoFaltando? }
// Todo logado lê (a agenda é da empresa). modo=tecnicos = só os técnicos (tela da Lousa).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { carregarAgenda, MSG_MIGRATION_AGENDA, type Modo } from '@/lib/agenda/server'
import { addDias, localDe, DIA_RE } from '@/lib/agenda/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const agora = localDe(new Date().toISOString())
  const sp = req.nextUrl.searchParams
  const de = DIA_RE.test(sp.get('de') || '') ? sp.get('de')! : agora.dia
  let ate = DIA_RE.test(sp.get('ate') || '') ? sp.get('ate')! : addDias(de, 6)
  if (ate < de) ate = de
  if (ate > addDias(de, 62)) ate = addDias(de, 62)
  const modo: Modo = sp.get('modo') === 'tecnicos' ? 'tecnicos' : 'coletiva'
  try {
    const r = await carregarAgenda(auth, de, ate, modo)
    return NextResponse.json({
      ...r, de, ate, agora, eu: auth.userId, admin: auth.isAdmin,
      ...(r.migracaoFaltando && modo === 'coletiva' ? { aviso: MSG_MIGRATION_AGENDA } : {}),
    })
  } catch (e) {
    console.error('[agenda] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar a agenda' }, { status: 500 })
  }
}
