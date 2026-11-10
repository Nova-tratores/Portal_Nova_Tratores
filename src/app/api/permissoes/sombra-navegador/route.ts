// POST /api/permissoes/sombra-navegador — comparações antiga × v2 feitas nas TELAS
// (usePermissoes, Fase 4.2). Só grava no buffer da sombra; quem é o usuário vem do
// login, nunca do corpo. Ver lib/permissoes/sombra-navegador.ts.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { anotarDoNavegador } from '@/lib/permissoes/sombra-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const lista = Array.isArray(body?.itens) ? body.itens.slice(0, 200) : []
  const itens = lista
    .filter((i: unknown): i is { tela_id: string; rota: string; antigo: boolean; v2: boolean } => {
      const x = i as Record<string, unknown>
      return typeof x?.tela_id === 'string' && typeof x?.rota === 'string' && typeof x?.antigo === 'boolean' && typeof x?.v2 === 'boolean'
    })
  anotarDoNavegador(auth.userId, itens)
  return new NextResponse(null, { status: 204 })
}
