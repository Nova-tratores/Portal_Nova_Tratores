// /api/gestao-vendas/vendedores — gestão da lista de vendedores.
// GET  → vendedores ativos.
// POST { nome, email? }      → adiciona um vendedor manual (email opcional).
// POST { listarOmie:true }   → lista candidatos das contas Omie (não grava);
//                              ignora nomes com "/" e remove o cargo do nome.
// POST { nomes: string[] }   → adiciona em lote os nomes escolhidos.
// Mesma permissão do resto do módulo (gestao-vendas / admin).

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import {
  adicionarVendedor,
  adicionarVendedoresEmLote,
  buscarVendedoresAtivos,
  listarCandidatosVendedoresOmie,
  podeGestaoVendas,
} from '@/lib/gestao-vendas/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const vendedores = await buscarVendedoresAtivos()
    return NextResponse.json({ vendedores })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}

type Body = {
  nome?: string
  email?: string | null
  listarOmie?: boolean
  nomes?: string[]
}

export async function POST(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  try {
    if (body.listarOmie) {
      const candidatos = await listarCandidatosVendedoresOmie()
      return NextResponse.json({ candidatos })
    }

    if (Array.isArray(body.nomes)) {
      const resultado = await adicionarVendedoresEmLote(body.nomes)
      return NextResponse.json(resultado)
    }

    if (typeof body.nome === 'string' && body.nome.trim()) {
      const vendedor = await adicionarVendedor(body.nome, body.email ?? null)
      const vendedores = await buscarVendedoresAtivos()
      return NextResponse.json({ vendedor, vendedores })
    }

    return NextResponse.json(
      { error: 'Informe "nome", "nomes": [...] ou "listarOmie": true.' },
      { status: 400 },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
