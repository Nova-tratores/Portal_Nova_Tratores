// POST /api/opa/pecas/estoque  { codigos: string[] }
// Peças S/Estoque: o "código existente" de cada peça é o SKU do catálogo da
// Omie. Esta rota procura esses SKUs no espelho produtos_caracteristicas e
// devolve, por código informado, o produto (conta, descrição) e a LOCAÇÃO no
// estoque (#PRATELEIRA/#ANDAR/#CAIXA). Aceita o código com e sem "RP-" (a lista
// da Mahindra tem RP-, a Omie às vezes não). Só leitura; qualquer usuário logado
// (a lista de peças é aberta a todos do portal — pni_pode_ver).

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { posDeCar, posInvalida, getCar } from '@/lib/ajustes/posicao'
import type { ProdutoSku } from '@/lib/opa-pecas/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Linha { conta_omie: string; codigo: string; descricao: string | null; caracteristicas: Record<string, string> | null }

const semRp = (c: string) => c.replace(/^RP-/, '')

export async function POST(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const corpo = await req.json().catch(() => ({})) as { codigos?: unknown }
  const pedidos = [...new Set((Array.isArray(corpo.codigos) ? corpo.codigos : [])
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0 && c.length <= 80))].slice(0, 3000)
  if (!pedidos.length) return NextResponse.json({ itens: {} })

  const variantes = [...new Set(pedidos.flatMap((c) => [c, semRp(c), `RP-${semRp(c)}`]))]
  const linhas: Linha[] = []
  for (let i = 0; i < variantes.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('produtos_caracteristicas')
      .select('conta_omie, codigo, descricao, caracteristicas')
      .in('codigo', variantes.slice(i, i + 200))
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    linhas.push(...((data || []) as Linha[]))
  }

  const porBase = new Map<string, ProdutoSku[]>()
  for (const l of linhas) {
    const pos = posDeCar(l.caracteristicas)
    const ok = pos.temLoc && !posInvalida(pos)
    const p: ProdutoSku = {
      sku: l.codigo,
      conta: String(l.conta_omie || '').toUpperCase(),
      descricao: l.descricao,
      tipo: getCar(l.caracteristicas, 'Tipo:') || null,
      locacao: ok ? { prateleira: pos.prat, andar: pos.andar, caixa: pos.caixa } : null,
    }
    const k = semRp(String(l.codigo).toUpperCase())
    porBase.set(k, [...(porBase.get(k) || []), p])
  }

  const itens: Record<string, ProdutoSku[]> = {}
  for (const c of pedidos) {
    const achados = porBase.get(semRp(c))
    if (!achados?.length) continue
    // com locação primeiro; depois NOVA antes de CASTRO; grafia exata antes da variante
    itens[c] = [...achados].sort((a, b) =>
      Number(!!b.locacao) - Number(!!a.locacao)
      || Number(b.sku.toUpperCase() === c) - Number(a.sku.toUpperCase() === c)
      || a.conta.localeCompare(b.conta) * -1)
  }
  return NextResponse.json({ itens })
}
