// Situação da porta única da Omie (fila, bloqueios, consumo do último minuto/hora).
// Painel provisório da Etapa 1 do plano docs/omie-fila-agendador-plano.md — a tela
// /agendamentos nova (Etapa 2) vai ler daqui. Só Dev.
// GET /api/omie/porta -> EstadoPorta
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { estadoPorta } from '@/lib/omie/porta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isDev) return NextResponse.json({ error: 'Só o Dev vê a porta da Omie.' }, { status: 403 })
  return NextResponse.json(estadoPorta())
}
