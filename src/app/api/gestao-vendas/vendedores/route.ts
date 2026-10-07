// /api/gestao-vendas/vendedores — gestão da lista de vendedores.
// GET  → vendedores ativos.
// POST { nome, email? }      → adiciona um vendedor manual (email opcional).
// POST { listarOmie:true }   → lista candidatos das contas Omie (não grava);
//                              ignora nomes com "/" e remove o cargo do nome.
// POST { nomes: string[] }   → adiciona em lote os nomes escolhidos.
// PATCH { id, carimbo_nome?, carimbo_cargo?, carimbo_telefone? }
//                            → carimbo do PDF da proposta (só texto, sem imagem).
// Mesma permissão do resto do módulo (gestao-vendas / admin).

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import {
  adicionarVendedor,
  adicionarVendedoresEmLote,
  atualizarCarimboVendedor,
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

type PatchBody = {
  id?: number
  carimbo_nome?: string | null
  carimbo_cargo?: string | null
  carimbo_telefone?: string | null
}

export async function PATCH(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Informe "id" do vendedor.' }, { status: 400 })

  try {
    const { id: _id, ...campos } = body
    void _id
    const vendedor = await atualizarCarimboVendedor(id, campos)
    const vendedores = await buscarVendedoresAtivos()
    return NextResponse.json({ vendedor, vendedores })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
