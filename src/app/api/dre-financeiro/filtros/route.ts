// =============================================================================
// API: filtros (opcoes de fornecedores/clientes, categorias, departamentos e
// grupos) - port FIEL de GET /api/filtros do server.js (linhas 4044-4094).
// Varre as tabelas de contas (pagar/receber conforme tipo) para a conta atual e
// monta as listas distintas, ordenadas em pt-BR, usadas nos selects de filtro.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, TIPO_PADRAO, TIPOS_VALIDOS,
  tabelaPorTipo, colunaNomePorTipo, aplicarConta,
} from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// pegaConta / pegaTipo reimplementados inline (server.js:68-77): le searchParams
// 'conta'/'tipo', senao cookie, senao default. Valores: nova|castro|todas e
// pagar|receber|ambos.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

function pegaTipo(request: NextRequest): string {
  const t = (request.nextUrl.searchParams.get('tipo')
    || request.cookies.get('tipo')?.value
    || TIPO_PADRAO).toString().toLowerCase()
  return (TIPOS_VALIDOS as Set<string>).has(t) ? t : 'pagar'
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]

    const fornecedores = new Map<any, any>()
    const categorias = new Map<any, any>()
    const departamentos = new Map<any, any>()
    const grupos = new Set<any>()

    for (const t of tipos) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      let q = supabase.from(tabela)
        .select(`codigo_cliente_fornecedor,${colNome},codigo_categoria,descricao_categoria,codigo_departamento,descricao_departamento,grupo_categoria`)
        .limit(20000)
      q = aplicarConta(q, conta)
      const { data, error } = await q
      if (error) throw new Error(error.message)

      ;(data || []).forEach((r: any) => {
        const nome = r[colNome]
        if (r.codigo_cliente_fornecedor && nome) {
          fornecedores.set(r.codigo_cliente_fornecedor, nome)
        }
        if (r.codigo_categoria) {
          categorias.set(r.codigo_categoria, r.descricao_categoria || r.codigo_categoria)
        }
        if (r.codigo_departamento) {
          departamentos.set(r.codigo_departamento, r.descricao_departamento || r.codigo_departamento)
        }
        if (r.grupo_categoria) grupos.add(r.grupo_categoria)
      })
    }

    const sortMap = (m: Map<any, any>) => Array.from(m, ([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    return NextResponse.json({
      fornecedores: sortMap(fornecedores),
      categorias: sortMap(categorias),
      departamentos: sortMap(departamentos),
      grupos: Array.from(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((g) => ({ codigo: g, nome: g })),
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
