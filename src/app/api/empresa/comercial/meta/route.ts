// POST /api/empresa/comercial/meta { vendedor, valor } — o diretor define a meta do vendedor (R$ de máquinas por mês)
// na tela /empresa → Comercial. Grava no mês atual; vale dali em diante até ser trocada. Só diretor, admin ou dev.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const { data: perm } = await supabaseAdmin.from('portal_permissoes').select('is_diretor').eq('user_id', g.user.id).maybeSingle()
  if (!g.user.isAdmin && (perm as { is_diretor?: boolean } | null)?.is_diretor !== true) {
    return NextResponse.json({ erro: 'Só o diretor define a meta.' }, { status: 403 })
  }
  const b = await req.json().catch(() => ({})) as { vendedor?: unknown; valor?: unknown }
  const vendedor = String(b.vendedor ?? '').trim().slice(0, 80)
  const valor = Math.round(Number(b.valor) * 100) / 100
  if (!vendedor || !Number.isFinite(valor) || valor < 0 || valor > 1e9) return NextResponse.json({ erro: 'Vendedor ou valor inválido.' }, { status: 400 })
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
  const { error } = await supabaseAdmin.from('empresa_metas_vendedor')
    .upsert({ vendedor, mes, valor, alterado_por: autorDe(g.user), alterado_em: new Date().toISOString() }, { onConflict: 'vendedor,mes' })
  if (error) {
    const falta = /does not exist|relation|schema cache/i.test(error.message)
    return NextResponse.json({ erro: falta ? 'A tabela de metas ainda não foi criada (sql/empresa-metas-vendedor.sql).' : error.message }, { status: falta ? 503 : 500 })
  }
  return NextResponse.json({ ok: true, vendedor, mes, valor })
}
