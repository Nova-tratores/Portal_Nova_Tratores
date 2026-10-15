// AGENDA DA SALA — GET /api/salas/disponivel?dia=&inicio=HH:MM&fim=HH:MM[&sala=][&ignorar_reuniao=]
// -> { livre: true } | { livre: false, mensagem, conflito }. Usado pelo formulário de reunião (aviso ao vivo).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { conflitoEm, listarSalas, uuidValido, migrationFaltou } from '@/lib/salas/server'
import { isoDe, rotuloConflito } from '@/lib/salas/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const dia = sp.get('dia') || ''
  const ini = (sp.get('inicio') || '').slice(0, 5)
  const fim = (sp.get('fim') || '').slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim) || fim <= ini) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }
  try {
    const salas = await listarSalas()
    const salaParam = sp.get('sala')
    const salaId = uuidValido(salaParam) ? salaParam : salas[0]?.id
    if (!salaId) return NextResponse.json({ livre: true, semSala: true })
    const ign = sp.get('ignorar_reuniao')
    const c = await conflitoEm(salaId, isoDe(dia, ini), isoDe(dia, fim), uuidValido(ign) ? { reuniaoId: ign } : undefined)
    return NextResponse.json(c ? { livre: false, mensagem: rotuloConflito(c), conflito: c } : { livre: true })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ livre: true, migracaoFaltando: true })
    console.error('[salas/disponivel] GET', e)
    return NextResponse.json({ error: 'Falha ao consultar a sala' }, { status: 500 })
  }
}
