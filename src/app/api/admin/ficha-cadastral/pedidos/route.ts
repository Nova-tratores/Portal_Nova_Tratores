import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { ehDiretor, pendentesParaDiretor, decidir, nomeDe } from '@/lib/admin/ficha-pedidos-server'

// Pedidos de mudança na ficha cadastral esperando o Diretor (09/11/2026).
// GET: só login; quem não é diretor recebe { diretor: false, pedidos: [] } (o aviso do layout chama em toda tela).
// PATCH { id, acao: 'autorizar' | 'recusar' | 'cancelar', motivo? }: autorizar/recusar só o Diretor;
// cancelar, quem pediu (ou admin).
export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Faça login de novo' }, { status: 401 })
  if (!(await ehDiretor(auth.userId))) return NextResponse.json({ diretor: false, pedidos: [] })
  try {
    return NextResponse.json({ diretor: true, pedidos: await pendentesParaDiretor(auth.isDev) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: e?.status || 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Faça login de novo' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = Number(b.id)
  const acao = b.acao
  if (!id || !['autorizar', 'recusar', 'cancelar'].includes(acao)) return NextResponse.json({ error: 'pedido inválido' }, { status: 400 })
  try {
    const eu = await nomeDe(auth.userId)
    const r = await decidir(id, acao, String(b.motivo || '').trim().slice(0, 500), { id: auth.userId, nome: eu.nome }, auth.isAdmin)
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: e?.status || 500 })
  }
}
