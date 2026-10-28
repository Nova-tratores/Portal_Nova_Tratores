// Comissões esperando o DIRETOR (José, 28/10/2026: "assim que gerar o pedido, tem que cair na cara dele").
// GET → { diretor, pedidos: [{ id, tecnico, mes, valor, pedido_por, pedido_em }] }. Só login: o aviso aparece em
// qualquer tela do portal; quem não é diretor recebe lista vazia (nada de valores).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { listarPedidos, ehDiretor, SemTabela } from '@/lib/mecanicos/lancamento-comissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    if (!(await ehDiretor(auth.userId))) return NextResponse.json({ diretor: false, pedidos: [] })
    const pedidos = (await listarPedidos({ abertos: true })).map((p) => ({ id: p.id, tecnico: p.tecnico, mes: p.mes, valor: p.valor, pedido_por: p.pedido_por, pedido_em: p.pedido_em }))
    return NextResponse.json({ diretor: true, pedidos })
  } catch (e) {
    if (e instanceof SemTabela) return NextResponse.json({ diretor: false, pedidos: [] })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 })
  }
}
