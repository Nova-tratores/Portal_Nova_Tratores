import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { montarConsulta, podeBuscar } from '@/lib/patrimonio/preco'
import { buscarPreco } from '@/lib/patrimonio/preco-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/patrimonio/preco { descricao, marca?, modelo?, categoria? }
// Sugestão de preço pela internet (anúncios de novo e usado com links).
// Só sugestão: quem decide o valor é a pessoa. Módulo 'patrimonio'.

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'patrimonio' }])
  if (acesso.resposta) return acesso.resposta
  const b = await req.json().catch(() => null) as { descricao?: string; marca?: string; modelo?: string; categoria?: string } | null
  const dados = { descricao: String(b?.descricao || ''), marca: String(b?.marca || ''), modelo: String(b?.modelo || ''), categoria: String(b?.categoria || '') }
  if (!podeBuscar(dados)) return NextResponse.json({ ok: false, erro: 'Preencha a descrição e a marca, o modelo ou a categoria.' }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, resultado: await buscarPreco(montarConsulta(dados)) })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
