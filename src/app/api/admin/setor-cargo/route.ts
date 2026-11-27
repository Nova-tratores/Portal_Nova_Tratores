// Setor e cargo num lugar só (José, 27/11/2026). Só admin.
//   POST { userId, cargo? } — depois que a Administração grava o setor/função (portal_permissoes),
//        copia setor e cargo para o organograma e o RH. cargo = cargo livre (setores sem lista).
//   GET  — "Conferir com o RH": Administração × RH de todo mundo, SEM gravar.
//   POST { todos: true } — "Aplicar": sincroniza só quem muda (vazio não apaga nada).
import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { revisarTodos, sincronizarSetorCargo } from '@/lib/organograma/setor-cargo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Só administrador' }, { status: 403 })
  try { return NextResponse.json({ linhas: await revisarTodos() }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao conferir' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Só administrador' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { userId?: string; cargo?: string | null; todos?: boolean }
  try {
    if (body.todos === true) {
      const muda = (await revisarTodos()).filter((l) => l.muda)
      let feitos = 0
      const falhas: string[] = []
      for (const l of muda) {
        const r = await sincronizarSetorCargo(l.userId)
        if (r.rh === 'erro') falhas.push(`${l.nome}: ${r.erroRh || 'erro no RH'}`); else feitos++
      }
      return NextResponse.json({ ok: true, feitos, falhas })
    }
    const userId = String(body.userId || '')
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 })
    const r = await sincronizarSetorCargo(userId, 'cargo' in body ? (body.cargo ?? null) : undefined)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao sincronizar' }, { status: 500 })
  }
}
