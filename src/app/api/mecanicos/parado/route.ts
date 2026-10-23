// Dinheiro parado AO VIVO (José, 19/10/2026: "assim que for faturado tem que mudar ali, ordem marcada
// como interna também não deve entrar"). A tabela posvendas_pendencias é uma foto do robô e fica velha;
// aqui calcula direto das OS (faturada pelo portal, faturada na Omie com NFS-e, concluída com nº do Omie,
// interna e cancelada saem na hora). A conta mora em lib/mecanicos/parado-vivo.ts (guardada: abre na hora).
// GET → { pendencias, geradoEm }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { paradoComCache } from '@/lib/mecanicos/parado-vivo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  try {
    const r = await paradoComCache(req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json({ pendencias: r.dados, geradoEm: r.geradoEm })
  } catch (e) {
    console.error('[mecanicos/parado]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao calcular o dinheiro parado' }, { status: 500 })
  }
}
