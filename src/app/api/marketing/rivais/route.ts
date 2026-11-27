// Radar dos concorrentes no Instagram (27/11/2026). Ver lib/marketing/rivais/rivais.ts.
// GET                                   → métricas de todos + última análise da IA
// POST { acao: 'adicionar', username, tipo? } · { acao: 'remover', username } · { acao: 'tipo', username, tipo }
//      { acao: 'coletar' } (lê o Instagram agora) · { acao: 'analisar' } (IA escreve a análise agora, ~US$ 0,10)
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { MSG_SQL_RIVAIS, analisarRivais, coletarRivais, faltaTabelaRivais, nossaVersao, painelRivais } from '@/lib/marketing/rivais/rivais'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')
const erro = (m: string, status = 500) => NextResponse.json({ ok: false, erro: faltaTabelaRivais(m) ? MSG_SQL_RIVAIS : m }, { status: faltaTabelaRivais(m) ? 503 : status })
/** "@Valtra.Brasil " ou o link do perfil → "valtra.brasil" */
const limpar = (s: unknown) => String(s || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase()

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo')
  if (g.resposta) return g.resposta
  try {
    return NextResponse.json({ ok: true, ...(await painelRivais()), podeEditar: podeEditar(g.user), ia: !!process.env.ANTHROPIC_API_KEY })
  } catch (e) { return erro((e as Error).message) }
}

export async function POST(req: Request) {
  const g = await guardarSite(req, 'conteudo')
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return erro('Sem permissão para mexer no radar.', 403)
  const b = await req.json().catch(() => ({}))
  const username = limpar(b.username)
  const tipo = ['marca', 'revenda'].includes(b.tipo) ? b.tipo : 'revenda'
  try {
    if (b.acao === 'adicionar') {
      if (!/^[a-z0-9._]{2,30}$/.test(username)) return erro('Escreva o @ do Instagram (ex.: valtrabrasil).', 400)
      const { error } = await sb.from('mkt_rivais').upsert({ username, tipo, ativo: true, criado_por: g.user.nome || null }, { onConflict: 'username' })
      if (error) return erro(error.message)
      await coletarRivais(username)   // já lê na hora, para aparecer (ou dizer que não achou)
      return NextResponse.json({ ok: true })
    }
    if (b.acao === 'remover') {
      const { error } = await sb.from('mkt_rivais').delete().eq('username', username).neq('tipo', 'nos')
      return error ? erro(error.message) : NextResponse.json({ ok: true })
    }
    if (b.acao === 'tipo') {
      const { error } = await sb.from('mkt_rivais').update({ tipo }).eq('username', username).neq('tipo', 'nos')
      return error ? erro(error.message) : NextResponse.json({ ok: true })
    }
    // "Fazer a nossa versão": vira ideia no calendário com o post deles anexado
    if (b.acao === 'nossa_versao') {
      if (!b.post) return erro('Falta o post de referência.', 400)
      return NextResponse.json({ ok: true, postId: await nossaVersao(String(b.post), g.user.nome || 'Radar') })
    }
    if (b.acao === 'coletar') return NextResponse.json({ ok: true, ...(await coletarRivais()) })
    if (b.acao === 'analisar') return NextResponse.json({ ok: true, ...(await analisarRivais()) })
    return erro('Ação desconhecida.', 400)
  } catch (e) { return erro((e as Error).message) }
}
