// GET /api/gestao-vendas/mes?mes=&ano=&conta= — tudo que as telas do mês
// precisam numa chamada: vendas enriquecidas + ajustes + vendedores ativos.
// Dados sensíveis (margens/comissões) → login + permissão gestao-vendas.

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import {
  buscarAjustes,
  buscarVendasEnriquecidas,
  buscarVendedoresAtivos,
  parseCompetencia,
  podeGestaoVendas,
} from '@/lib/gestao-vendas/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const comp = parseCompetencia(new URL(request.url))
  if (!comp) return NextResponse.json({ error: 'Parâmetros mes/ano/conta inválidos' }, { status: 400 })

  try {
    const [vendas, ajustes, vendedores] = await Promise.all([
      buscarVendasEnriquecidas(comp.mes, comp.ano, comp.conta),
      buscarAjustes(comp.mes, comp.ano, comp.conta),
      buscarVendedoresAtivos(),
    ])
    return NextResponse.json({ vendas, ajustes, vendedores })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao consultar' },
      { status: 500 },
    )
  }
}
