// =============================================================================
// API: clientes/sync - port FIEL de POST /api/clientes/sync do server.js
// (linhas 3502-3511). Dispara em background a sincronizacao do cadastro de
// clientes do Omie para a conta informada (nova|castro). Responde 202 sem
// esperar o termino. 'todas' nao e aceito (o sync e por conta).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
import { sincronizarClientes } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const conta = (request.nextUrl.searchParams.get('conta') || CONTA_PADRAO).toString().toLowerCase()
    if (conta === 'todas') return NextResponse.json({ erro: 'Especifique conta=nova ou conta=castro' }, { status: 400 })
    sincronizarClientes(conta).catch((e: any) => console.error('sync clientes bg:', e))
    return NextResponse.json({ ok: true, mensagem: 'Sync de clientes iniciado em background', conta }, { status: 202 })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
