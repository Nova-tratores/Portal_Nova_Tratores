// POST /api/empresa/preco { codigo_produto, conta: 'nova'|'castro', valor } — o diretor muda o preço de venda de uma
// máquina pela Vitrine do /empresa (José, 11/11: "conseguimos alterar o preço das máquinas pela tela do diretor").
// O preço de venda mora no OMIE (produtos.valor_unitario é a cópia): muda lá por AlterarProduto (alterarPrecoVenda, a
// mesma do recebimento de mercadorias) e a cópia do portal é atualizada junto. Só diretor, admin ou dev.
// Fica registrado no audit_log (de → para, quem mudou).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { alterarPrecoVenda } from '@/lib/estoque/recebimentos'
import { recalcular } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const { data: perm } = await supabaseAdmin.from('portal_permissoes').select('is_diretor').eq('user_id', g.user.id).maybeSingle()
  if (!g.user.isAdmin && (perm as { is_diretor?: boolean } | null)?.is_diretor !== true) {
    return NextResponse.json({ erro: 'Só o diretor muda o preço por aqui.' }, { status: 403 })
  }
  const b = await req.json().catch(() => ({})) as { codigo_produto?: unknown; conta?: unknown; valor?: unknown }
  const codigo = Number(b.codigo_produto)
  const conta = String(b.conta || '').toUpperCase()
  const valor = Math.round(Number(b.valor) * 100) / 100
  if (!Number.isInteger(codigo) || codigo <= 0 || (conta !== 'NOVA' && conta !== 'CASTRO') || !Number.isFinite(valor) || valor <= 0 || valor > 1e8) {
    return NextResponse.json({ erro: 'Produto, empresa ou valor inválido.' }, { status: 400 })
  }
  const { data: antes } = await supabaseAdmin.from('produtos').select('descricao,valor_unitario,familia_nome')
    .eq('codigo_produto', String(codigo)).eq('conta_omie', conta.toLowerCase()).maybeSingle()
  if (!antes) return NextResponse.json({ erro: 'Produto não encontrado no portal.' }, { status: 404 })
  if (/^pe[cç]a/i.test(String(antes.familia_nome || ''))) return NextResponse.json({ erro: 'Por aqui só máquinas.' }, { status: 400 })
  try {
    await alterarPrecoVenda(codigo, valor, conta as 'NOVA' | 'CASTRO')
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }
  await supabaseAdmin.from('audit_log').insert({
    user_id: g.user.id, user_nome: autorDe(g.user), sistema: 'empresa', acao: 'preco_venda',
    entidade: 'produto', entidade_id: String(codigo), entidade_label: String(antes.descricao || '').slice(0, 200),
    detalhes: { conta, de: Number(antes.valor_unitario) || 0, para: valor, origem: 'Vitrine do /empresa' },
  })
  void recalcular('maquinas').catch(() => {}) // a tabela gravada das máquinas pega o preço novo
  return NextResponse.json({ ok: true, codigo_produto: codigo, conta, valor, de: Number(antes.valor_unitario) || 0 })
}
