// Regras editáveis da comissão (José, 20/10/2026). GET = quem vê o módulo; PUT = admin/dev.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { lerRegrasComissao, gravarRegrasComissao } from '@/lib/mecanicos/regras-comissao-server'
import { REGRAS_PADRAO } from '@/lib/mecanicos/regras-comissao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  return NextResponse.json({ regras: await lerRegrasComissao(), padrao: REGRAS_PADRAO, podeEditar: !!guarda.user?.isAdmin })
}

export async function PUT(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  if (!guarda.user?.isAdmin) return NextResponse.json({ error: 'Só administrador muda as regras da comissão' }, { status: 403 })
  try {
    const corpo = await req.json()
    return NextResponse.json({ regras: await gravarRegrasComissao(corpo.regras, autorDe(guarda.user!)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao gravar' }, { status: 500 })
  }
}
