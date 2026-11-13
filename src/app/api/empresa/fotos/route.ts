// Trocar a foto de uma máquina pela tela do diretor (/empresa → Máquinas → clicar na máquina → Trocar foto).
// José, 12/11: "foto ruim" — a busca automática pega o 1º resultado; aqui ele escolhe entre várias.
// GET  ?q=texto            → opções da internet (Bing): { opcoes: [{ miniatura, original }] }
// POST { codigo_produto, conta, url } → baixa a escolhida, guarda no armazenamento do portal (fotos-maquinas)
//                                       e grava em produtos.imagem_url (vale também no Visual Estoque).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { buscarOpcoesFoto, guardarFoto } from '@/lib/empresa/maquinas'
import { recalcular } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)
  if (!q) return NextResponse.json({ opcoes: [] })
  try {
    return NextResponse.json({ opcoes: await buscarOpcoesFoto(q, 12, req.nextUrl.searchParams.get('semFundo') === '1') })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const b = await req.json().catch(() => ({})) as { codigo_produto?: unknown; conta?: unknown; url?: unknown }
  const codigo = Number(b.codigo_produto), conta = String(b.conta || '').toLowerCase(), url = String(b.url || '')
  if (!Number.isInteger(codigo) || codigo <= 0 || (conta !== 'nova' && conta !== 'castro') || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ erro: 'Máquina ou foto inválida.' }, { status: 400 })
  }
  const { data: antes } = await supabaseAdmin.from('produtos').select('descricao,familia_nome,imagem_url').eq('codigo_produto', codigo).eq('conta_omie', conta).maybeSingle()
  if (!antes) return NextResponse.json({ erro: 'Máquina não encontrada.' }, { status: 404 })
  if (/^pe[cç]a/i.test(String(antes.familia_nome || ''))) return NextResponse.json({ erro: 'Por aqui só máquinas.' }, { status: 400 })
  const publico = await guardarFoto(codigo, conta, url, typeof (b as { miniatura?: unknown }).miniatura === 'string' ? String((b as { miniatura?: unknown }).miniatura) : undefined)
  if (!publico) return NextResponse.json({ erro: 'Essa foto não deu para baixar (o site bloqueia). Escolha outra.' }, { status: 422 })
  await supabaseAdmin.from('audit_log').insert({
    user_id: g.user.id, user_nome: autorDe(g.user), sistema: 'empresa', acao: 'foto_maquina', entidade: 'produto', entidade_id: String(codigo),
    entidade_label: String(antes.descricao || '').slice(0, 200), detalhes: { conta, de: antes.imagem_url || null, para: publico, origem: url },
  })
  void recalcular('maquinas').catch(() => {})
  return NextResponse.json({ ok: true, imagem_url: publico })
}
