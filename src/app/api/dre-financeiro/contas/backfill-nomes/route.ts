// =============================================================================
// API: contas/backfill-nomes - repreenche nome_fornecedor/nome_cliente nas
// linhas onde ficaram null (ex.: corrompidas pelo bug do mapa parcial no sync).
// Reusa o buscarClientesFornecedores endurecido: se o mapa vier incompleto, a
// conta e' PULADA (nao repara gravando null). UPDATE so onde nome IS NULL.
// Dispara em background (pode demorar ~1-2min); responde 202.
//   ?conta=nova|castro|todas (default: todas)
//   ?tipo=pagar|receber|ambos (default: ambos)
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - modulo CommonJS sem tipos
import { backfillNomesContas } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const conta = (sp.get('conta') || 'todas').toString().toLowerCase()
    const tipo = (sp.get('tipo') || 'ambos').toString().toLowerCase()
    if (!['pagar', 'receber', 'ambos'].includes(tipo)) {
      return NextResponse.json({ erro: 'tipo invalido (use pagar|receber|ambos)' }, { status: 400 })
    }
    // Dispara em background (pode demorar)
    backfillNomesContas(conta, tipo).catch((e: any) => console.error('backfill-nomes bg:', e))
    return NextResponse.json({ ok: true, mensagem: 'Backfill de nomes iniciado em background', conta, tipo }, { status: 202 })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
