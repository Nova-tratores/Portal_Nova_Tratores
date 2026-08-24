// GET /api/financeiro/despesas/omie?lancamentos=1,2,3
//
// Devolve o que a tela de Despesas precisa do lado Omie e que o NAVEGADOR NÃO
// CONSEGUE LER: as duas tabelas envolvidas (`omie_cache` e `contas_pagar`)
// respondem 0 linhas com a chave anônima — a permissão delas é de servidor.
// Foi por isso que o chip da categoria aparecia como "2.08.01" em vez do nome:
// o dicionário chegava vazio no cliente e a cascata caía no código cru.
//
// Duas coisas vêm daqui:
//  · categorias  → traduz o código Omie para nome de gente
//  · títulos     → NÚMERO DO DOCUMENTO e NÚMERO DA PARCELA de cada lançamento,
//                  que é o que se procura no Omie (o `codigo_lancamento`,
//                  2522774800, é chave interna e não serve pra buscar lá), MAIS
//                  o estado de pagamento de cada parcela (PAGO / A VENCER /
//                  ATRASADO / CANCELADO). É esse último que evita abrir o Omie
//                  só pra saber se a 2ª parcela já saiu.
//
// Lê o cache IGNORANDO o TTL de propósito: descrição de categoria não muda, e
// a rota /api/financeiro/contas-pagar/omie?tipo=categorias iria consultar a API
// do Omie no miss, travando um dashboard por segundos.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/** o `.in()` vai na URL do PostgREST — lotear evita estourar o tamanho dela */
const LOTE = 200

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'financeiro')
  } catch (e) {
    const status = (e as { status?: number })?.status || 401
    return NextResponse.json({ erro: (e as Error).message }, { status })
  }

  const brutos = (req.nextUrl.searchParams.get('lancamentos') || '')
    .split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s))
  const codigos = [...new Set(brutos)]

  const [cats, titulos] = await Promise.all([
    supabase.from('omie_cache').select('empresa,codigo,descricao').eq('tipo', 'categorias'),
    (async () => {
      const out: unknown[] = []
      for (let i = 0; i < codigos.length; i += LOTE) {
        const { data } = await supabase
          .from('contas_pagar')
          .select('codigo_lancamento,numero_documento,numero_documento_fiscal,numero_parcela,status_titulo,data_vencimento,data_pagamento,valor_documento,valor_pago,conta_omie')
          .in('codigo_lancamento', codigos.slice(i, i + LOTE).map(Number))
        if (data) out.push(...data)
      }
      return out
    })(),
  ])

  return NextResponse.json({
    categorias: cats.data || [],
    titulos,
    // se o cache estiver vazio a tela mostra o código cru; melhor dizer o porquê
    aviso: (cats.data || []).length === 0 ? 'cache de categorias vazio' : null,
  })
}
