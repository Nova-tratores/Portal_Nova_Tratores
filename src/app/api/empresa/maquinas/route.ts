// GET /api/empresa/maquinas[?recalcular=1] — máquinas da loja por local (estoque + demonstração) para o Estoque da loja
// e a Vitrine do /empresa. Lê a área 'maquinas' gravada em empresa_painel (src/lib/empresa/maquinas.ts).
// POST { codigo_produto, conta, ambiente } — o diretor muda o LOCAL da máquina (o mesmo campo que o Visual Estoque →
// Pátio grava ao arrastar: produtos.ambiente). Só diretor, admin ou dev; fica no audit_log.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { lerArea, recalcular } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  try {
    const r = await lerArea('maquinas', req.nextUrl.searchParams.get('recalcular') === '1')
    return NextResponse.json({ ...(r.dados as object), calculadoEm: r.calculadoEm }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}

const LOCAIS = ['patio', 'showroom', 'oficina', 'oficina2', 'barracao']

export async function POST(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const { data: perm } = await supabaseAdmin.from('portal_permissoes').select('is_diretor').eq('user_id', g.user.id).maybeSingle()
  if (!g.user.isAdmin && (perm as { is_diretor?: boolean } | null)?.is_diretor !== true) return NextResponse.json({ erro: 'Só o diretor muda o local por aqui.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { codigo_produto?: unknown; conta?: unknown; ambiente?: unknown }
  const codigo = Number(b.codigo_produto), conta = String(b.conta || '').toLowerCase(), ambiente = String(b.ambiente || '')
  if (!Number.isInteger(codigo) || codigo <= 0 || (conta !== 'nova' && conta !== 'castro') || !LOCAIS.includes(ambiente)) return NextResponse.json({ erro: 'Produto, empresa ou local inválido.' }, { status: 400 })
  const { data: antes } = await supabaseAdmin.from('produtos').select('descricao,ambiente').eq('codigo_produto', codigo).eq('conta_omie', conta).maybeSingle()
  if (!antes) return NextResponse.json({ erro: 'Produto não encontrado.' }, { status: 404 })
  // posição zerada: o mapa do Visual Estoque distribui sozinho no local novo
  const { error } = await supabaseAdmin.from('produtos').update({ ambiente, pos_x: 0, pos_y: 0 }).eq('codigo_produto', codigo).eq('conta_omie', conta)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  await supabaseAdmin.from('audit_log').insert({
    user_id: g.user.id, user_nome: autorDe(g.user), sistema: 'empresa', acao: 'local_maquina', entidade: 'produto', entidade_id: String(codigo),
    entidade_label: String(antes.descricao || '').slice(0, 200), detalhes: { conta, de: antes.ambiente || null, para: ambiente },
  })
  void recalcular('maquinas').catch(() => {})
  return NextResponse.json({ ok: true, codigo_produto: codigo, conta, ambiente })
}
