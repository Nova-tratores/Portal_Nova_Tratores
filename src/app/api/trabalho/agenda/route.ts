// CENTRAL DE TRABALHO — agenda de uma pessoa para sugerir a data do ticket.
// GET /api/trabalho/agenda?user=<uuid>&duracao=2[&inicio=AAAA-MM-DD]
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { sugestaoAgenda } from '@/lib/trabalho/agenda-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const user = sp.get('user') || auth.userId
  if (!/^[0-9a-f-]{36}$/i.test(user)) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 })
  const duracao = Math.max(1, Math.min(120, Number(sp.get('duracao')) || 1))
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('inicio') || '') ? sp.get('inicio') : null
  const r = await sugestaoAgenda(user, duracao, inicio)
  // devolve só o necessário (nomes das coisas que ocupam os dias)
  return NextResponse.json({ hoje: r.hoje, sugestao: r.sugestao, conflitos: r.conflitos.map((c) => ({ nome: c.nome, ini: c.ini, fim: c.fim })) })
}
