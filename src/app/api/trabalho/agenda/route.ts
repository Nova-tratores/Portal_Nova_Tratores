// CENTRAL DE TRABALHO — agenda de uma pessoa para sugerir a data do ticket.
// GET /api/trabalho/agenda?user=<uuid>&duracao=2[&inicio=AAAA-MM-DD]
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { sugestaoAgenda } from '@/lib/trabalho/agenda-server'
import { diasOcupados } from '@/lib/trabalho/agenda'

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
  const urgente = sp.get('urgente') === '1'
  const r = await sugestaoAgenda(user, duracao, inicio, urgente)
  // Calendário: o que já está marcado em cada dia (de 60 dias atrás a 1 ano).
  // Agenda de OUTRA pessoa: só diz que está ocupado, sem os nomes.
  const proprio = user === auth.userId
  const de = somaDias(r.hoje, -60), ate = somaDias(r.hoje, 365)
  const ocupados = Object.fromEntries(Object.entries(diasOcupados(r.ocupacao, de, ate))
    .map(([d, nomes]) => [d, proprio ? nomes : nomes.map(() => 'Ocupado')]))
  // devolve só o necessário (nomes das coisas que ocupam os dias)
  return NextResponse.json({
    hoje: r.hoje, minimo: r.minimo, sugestao: r.sugestao, sugestoes: r.sugestoes, ocupados,
    conflitos: r.conflitos.map((c) => ({ nome: c.nome, ini: c.ini, fim: c.fim })),
  })
}

function somaDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
