// GET /api/gestao-vendas/pedidos-relatorio?mes=&ano= — pedidos FATURADO do mês
// (pedidos_venda_relatorio já vem com vendedor + itens com custo). Usado no
// relatório "Geral da Loja" (combina as duas empresas; conta é ignorada).

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { buscarPedidosRelatorio, podeGestaoVendas } from '@/lib/gestao-vendas/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const url = new URL(request.url)
  const mes = Number(url.searchParams.get('mes'))
  const ano = Number(url.searchParams.get('ano'))
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) {
    return NextResponse.json({ error: 'Parâmetros mes/ano inválidos' }, { status: 400 })
  }

  try {
    const pedidos = await buscarPedidosRelatorio(mes, ano)
    return NextResponse.json({ pedidos })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
