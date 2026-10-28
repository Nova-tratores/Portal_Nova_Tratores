import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'

// POST /api/push/send — DESLIGADO (28/10/2026).
// Mandava toda mensagem do chat do Financeiro para TODOS os aparelhos e lia a push_subscriptions,
// que é do app do mecânico (nunca funcionou no portal). O push do portal agora sai de cada aviso
// do sino, só para o dono (src/lib/push/portal-server.ts). Fica respondendo ok para o chat não reclamar.
export async function POST(req) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  return NextResponse.json({ ok: true, skipped: true, reason: 'push do chat desligado' })
}
