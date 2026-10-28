// Ajustes do tempário Mahindra (José, 28/10/2026). GET = ajustes ativos · POST = ajustar uma atividade (base_i) ou
// incluir uma nova (opcionalmente baseado_em uma parecida) · DELETE ?id= = desfazer. Autoria do login.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { carregarAjustes, salvarAjuste, desfazerAjuste, SemTabelaTempario } from '@/lib/mecanicos/tempario-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (e: unknown) => e instanceof SemTabelaTempario
  ? NextResponse.json({ error: e.message, semTabela: true }, { status: 503 })
  : NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 400 })

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  try { return NextResponse.json(await carregarAjustes(req.nextUrl.searchParams.get('novo') === '1')) } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  try {
    const b = await req.json()
    const n = (v: unknown) => (v == null || v === '' ? null : Number(v))
    const ajuste = await salvarAjuste({
      base_i: n(b.base_i), baseado_em: n(b.baseado_em), codigo: b.codigo || null, sistema: b.sistema || null, subsistema: b.subsistema || null,
      atividade: String(b.atividade || ''), minutos: n(b.minutos), motivo: String(b.motivo || ''), os_origem: b.os_origem || null,
    }, { id: g.user.id, nome: autorDe(g.user) })
    return NextResponse.json({ ajuste })
  } catch (e) { return erro(e) }
}

export async function DELETE(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  try { await desfazerAjuste(Number(req.nextUrl.searchParams.get('id'))); return NextResponse.json({ ok: true }) } catch (e) { return erro(e) }
}
