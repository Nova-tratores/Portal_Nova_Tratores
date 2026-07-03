// =============================================================================
// API: sync/usuarios - sincroniza os usuarios do Omie (ListarUsuarios) para a
// tabela omie_usuarios, que traduz o codigo (incluido_por/alterado_por, ex.
// "P000454175") em nome real. Roda para NOVA e CASTRO. Dataset pequeno (~dezenas
// de usuarios), entao executa sincrono. GET e POST fazem o mesmo (facilita o
// disparo manual pelo navegador).
// =============================================================================
import { NextResponse } from 'next/server'
import { sincronizarUsuariosOmie } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

async function run() {
  const porConta: Record<string, number> = {}
  for (const conta of ['nova', 'castro']) {
    try {
      porConta[conta] = await sincronizarUsuariosOmie(conta)
    } catch (e: any) {
      porConta[conta] = -1
      console.error(`sync/usuarios ${conta}:`, e.message)
    }
  }
  return porConta
}

export async function POST() {
  try {
    const porConta = await run()
    return NextResponse.json({ ok: true, por_conta: porConta })
  } catch (e: any) {
    console.error('sync/usuarios:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function GET() {
  return POST()
}
