// Categorias e contas correntes do Omie para o recibo (GET ?empresa=&tipo=recebemos|pagamos).
// pagamos → categorias de despesa · recebemos → categorias de receita. Cache em memória no servidor.
import { NextResponse } from 'next/server'
import { guardarRecibos } from '@/lib/recibos/guarda'
import { listasOmie } from '@/lib/recibos/omie'
import { EMPRESAS_RECIBO } from '@/lib/recibos/tipos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  const u = new URL(req.url)
  const empresa = u.searchParams.get('empresa') || 'Nova Tratores'
  if (!(EMPRESAS_RECIBO as readonly string[]).includes(empresa)) return NextResponse.json({ erro: 'Empresa inválida' }, { status: 400 })
  const tipo = u.searchParams.get('tipo') === 'pagamos' ? 'pagamos' : 'recebemos'
  try {
    return NextResponse.json(await listasOmie(empresa, tipo))
  } catch (e) {
    return NextResponse.json({ erro: `Não consegui buscar as listas do Omie: ${(e as Error).message}` }, { status: 502 })
  }
}
