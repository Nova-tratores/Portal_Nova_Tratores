// Lista pronta de produtos para a Solicitação de Compras.
// GET /api/tickets/compras/produtos?q=
//   modelos → marca+modelo agrupados (máquina é cadastrada por chassi)
//   itens   → linhas do cadastro que casam por código/descrição (só com q)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { agruparModelos, type ProdutoLinha } from '@/lib/tickets/compras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLUNAS = 'codigo, descricao, marca, modelo, familia_nome, estoque'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  // Caracteres com significado no filtro do PostgREST saem da busca.
  const q = (req.nextUrl.searchParams.get('q') || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 60)

  let qModelos = supabaseAdmin
    .from('produtos')
    .select(COLUNAS)
    .eq('inativo', false)
    .not('modelo', 'is', null)
    .neq('modelo', '')
    // Peça também tem "modelo" (o do trator em que serve): fica fora do
    // agrupamento e é achada por código/descrição em `itens`.
    .not('familia_nome', 'ilike', '*peça*')
    .order('codigo')
    .limit(1000)
  // Sem busca: sugestão inicial só com as famílias de itens NOVOS (Trator Novo,
  // Implemento Novo) — cabe no teto de 1000 linhas do PostgREST.
  qModelos = q
    ? qModelos.or(`modelo.ilike.*${q}*,marca.ilike.*${q}*,familia_nome.ilike.*${q}*`)
    : qModelos.ilike('familia_nome', '*novo*')

  const { data: linhasModelos, error } = await qModelos
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const modelos = agruparModelos((linhasModelos || []) as ProdutoLinha[]).slice(0, 12)

  let itens: ProdutoLinha[] = []
  if (q.length >= 2) {
    const { data } = await supabaseAdmin
      .from('produtos')
      .select(COLUNAS)
      .eq('inativo', false)
      .or(`codigo.ilike.*${q}*,descricao.ilike.*${q}*`)
      .order('descricao')
      .limit(40)
    // Mesmo SKU existe nas duas contas (NOVA/CASTRO): fica uma linha só.
    const vistos = new Set<string>()
    itens = ((data || []) as ProdutoLinha[]).filter((p) => {
      const chave = String(p.codigo || '').toUpperCase()
      if (!chave || vistos.has(chave)) return false
      vistos.add(chave)
      return true
    }).slice(0, 15)
  }

  return NextResponse.json({ modelos, itens })
}
