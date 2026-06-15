// =============================================================================
// API: patrimonio/titulo - port FIEL de GET /api/patrimonio/titulo do server.js
// (linhas 1781-1820). Drill de 2o nivel: dados completos de um titulo
// (codigo_lancamento) em contas_pagar OU contas_receber. tipo escolhe a tabela.
// Enriquece com o cadastro do cliente/fornecedor quando disponivel.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const sp = request.nextUrl.searchParams
    const tipo = String(sp.get('tipo') || '').toLowerCase()
    const codigo = String(sp.get('codigo') || '').trim()
    if (!['a_receber', 'a_pagar'].includes(tipo)) return NextResponse.json({ erro: 'tipo deve ser a_receber ou a_pagar' }, { status: 400 })
    if (!codigo) return NextResponse.json({ erro: 'informe codigo (codigo_lancamento)' }, { status: 400 })
    const tabela = tipo === 'a_receber' ? 'contas_receber' : 'contas_pagar'
    const colNome = tipo === 'a_receber' ? 'nome_cliente' : 'nome_fornecedor'

    const { data, error } = await supabase.from(tabela)
      .select('*').eq('codigo_lancamento', codigo).limit(1)
    if (error) throw new Error(error.message)
    if (!data || !data.length) return NextResponse.json({ erro: 'titulo nao encontrado' }, { status: 404 })
    const titulo = data[0]

    // Enriquece com cadastro do cliente/fornecedor (se existir)
    let cadastro: any = null
    if (titulo.codigo_cliente_fornecedor) {
      const slug = String(titulo.conta_omie || '').toLowerCase()
      const { data: cli } = await supabase.from('clientes')
        .select('*')
        .eq('codigo_cliente_omie', titulo.codigo_cliente_fornecedor)
        .eq('conta_omie', slug)
        .limit(1)
      if (cli && cli.length) cadastro = cli[0]
    }

    return NextResponse.json({
      tipo,
      titulo,
      colNome,
      cadastro,
      aberto: Math.max((Number(titulo.valor_documento) || 0) - (Number(titulo.valor_pago) || 0), 0),
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
