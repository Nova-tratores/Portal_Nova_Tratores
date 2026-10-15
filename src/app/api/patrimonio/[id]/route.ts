import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { atualizarItem, buscarItem, excluirItem, listarMovimentacoes, semMigracao, semMigracao02 } from '@/lib/patrimonio/db-server'
import { validarForm, type DadosForm } from '@/lib/patrimonio/tipos'

export const dynamic = 'force-dynamic'

// Um item do Patrimônio Loja (id ou código PAT-000001).
// GET    → item + movimentações (por onde passou)
// PATCH  → { form: DadosForm, motivo? } — mudou lugar/mão/situação = movimentação
// DELETE → tira da lista (o histórico fica)

function erro(e: unknown) {
  const err = e as { code?: string; message?: string }
  if (semMigracao(err)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta rodar o sql/patrimonio-01.sql no banco.' }, { status: 503 })
  if (semMigracao02(err)) return NextResponse.json({ ok: false, migracaoFaltando: true, erro: 'Falta rodar o sql/patrimonio-02.sql no banco (quantidade e etiqueta).' }, { status: 503 })
  return NextResponse.json({ ok: false, erro: err?.message || String(e) }, { status: 500 })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const { id } = await params
  try {
    const item = await buscarItem(decodeURIComponent(id))
    if (!item) return NextResponse.json({ ok: false, erro: 'Item não encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true, item, movimentacoes: await listarMovimentacoes(item.id) })
  } catch (e) { return erro(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const { id } = await params
  const body = await req.json().catch(() => null) as { form?: DadosForm; motivo?: string } | null
  if (!body?.form) return NextResponse.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 })
  const { erros, dados } = validarForm(body.form)
  if (erros.length) return NextResponse.json({ ok: false, erro: `Falta: ${erros.join(', ')}.` }, { status: 400 })
  try {
    const item = await atualizarItem(id, dados, acesso.user, body.motivo)
    return NextResponse.json({ ok: true, item, movimentacoes: await listarMovimentacoes(item.id) })
  } catch (e) { return erro(e) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const { id } = await params
  try {
    await excluirItem(id, acesso.user)
    return NextResponse.json({ ok: true })
  } catch (e) { return erro(e) }
}
