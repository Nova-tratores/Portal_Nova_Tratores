// Recibos de pagamento: GET lista (?busca=) · POST emite um novo (e lança no Omie se omie_lancar).
import { NextResponse } from 'next/server'
import { guardarRecibos } from '@/lib/recibos/guarda'
import { validarOmie, validarRecibo } from '@/lib/recibos/tipos'
import { conferirColunasOmie, emitirRecibo, guardarEscolhaOmie, lancarOmie, listarRecibos, nomeUsuario } from '@/lib/recibos/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  const u = new URL(req.url)
  try {
    const recibos = await listarRecibos({ busca: u.searchParams.get('busca') || '' })
    return NextResponse.json({ recibos })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  let dados, escolha
  try {
    const corpo = await req.json()
    dados = validarRecibo(corpo)
    escolha = validarOmie(corpo, dados)
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
  try {
    if (escolha) await conferirColunasOmie()
    const nome = await nomeUsuario(g.auth.userId)
    let recibo = await emitirRecibo(dados, g.auth.userId, nome || g.auth.email)
    // recibo já está emitido: daqui pra frente uma falha do Omie fica gravada em omie_erro (tela oferece "Tentar de novo")
    if (escolha) recibo = await lancarOmie(await guardarEscolhaOmie(recibo.id, escolha))
    return NextResponse.json({ recibo })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
