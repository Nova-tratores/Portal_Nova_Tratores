// Caixinha dos técnicos (lida do RH) para a Janela Mecânicos — só leitura. GET.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { lerCaixinha } from '@/lib/mecanicos/caixinha-server'
import { partesBR } from '@/lib/datas/brasil'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  const p = partesBR()
  try { return NextResponse.json(await lerCaixinha({ mes: Number(p.mes), ano: Number(p.ano) })) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 }) }
}
