import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { listarMovimentacoes, moverUnidades } from '@/lib/patrimonio/db-server'
import { SITUACOES, type Situacao } from '@/lib/patrimonio/tipos'

export const dynamic = 'force-dynamic'

// POST /api/patrimonio/<id>/unidades — um item em vários lugares (sql/patrimonio-03, 19/11/2026)
// { de: 'principal' | <id da parte>, quantidade, para: { local_id, local_tecnico, responsavel, situacao }, motivo? }
// → separa/move N unidades; destino igual a um lugar que já tem unidades = junta lá.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const { id } = await params
  const b = await req.json().catch(() => null) as {
    de?: unknown; quantidade?: unknown; motivo?: unknown
    para?: { local_id?: unknown; local_tecnico?: unknown; responsavel?: unknown; situacao?: unknown }
  } | null
  const de = typeof b?.de === 'string' ? b.de : ''
  const situacao = (SITUACOES as readonly string[]).includes(String(b?.para?.situacao)) ? b!.para!.situacao as Situacao : null
  if (!de || !b?.para || !situacao) return NextResponse.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 })
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  try {
    const item = await moverUnidades(decodeURIComponent(id), de, Number(b.quantidade), {
      local_id: txt(b.para.local_id, 100), local_tecnico: txt(b.para.local_tecnico, 120), responsavel: txt(b.para.responsavel, 120), situacao,
    }, txt(b.motivo, 500) || null, acesso.user)
    return NextResponse.json({ ok: true, item, movimentacoes: await listarMovimentacoes(item.id) })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as { message?: string })?.message || String(e) }, { status: 400 })
  }
}
