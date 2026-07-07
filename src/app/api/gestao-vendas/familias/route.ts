// GET /api/gestao-vendas/familias?mes=&ano=&conta= — cards por família para o
// dashboard: venda/CMC do mês + comparativos (mês anterior e ano anterior).

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { agregadoPorFamilia, parseCompetencia, podeGestaoVendas } from '@/lib/gestao-vendas/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const comp = parseCompetencia(new URL(request.url))
  if (!comp) return NextResponse.json({ error: 'Parâmetros mes/ano/conta inválidos' }, { status: 400 })

  try {
    const dados = await agregadoPorFamilia(comp.mes, comp.ano, comp.conta)
    return NextResponse.json(dados)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
