// Garantias para o Centro do Pós-Vendas (José, 19/10/2026: "opções melhores para entender as garantias,
// pegando direto do módulo de garantia"). Só leitura das tabelas do módulo (garantias + peças + pendências
// + montadora). Valor esperado = peças + horas × valor/h da fábrica + km × valor/km da fábrica.
// GET → { hoje, garantias: [...] }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { garantiasPainelComCache } from '@/lib/mecanicos/garantias-lista'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }, { modulo: 'garantias' }])
  if (guarda.resposta) return guarda.resposta
  try {
    const { dados } = await garantiasPainelComCache(req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json(dados)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao carregar as garantias' }, { status: 500 })
  }
}
