// Tratorilson no Centro do Pós-Vendas (José, 16/10/2026).
// GET → última análise + ensinamentos. Se a análise tem mais de 3 h (ou não existe), começa uma
//   nova em segundo plano e responde { gerando: true } — a tela pergunta de novo em seguida.
// POST {acao:'analisar'} → refaz agora e espera.
// POST {acao:'ensinar', conteudo} | {acao:'editar', id, conteudo} | {acao:'apagar', id} → ensinamentos.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { autenticar } from '@/lib/auth/server'
import { listarEnsinamentos, ultimaAnalise, gerarUmaVez, estaGerando, ensinar, editarEnsinamento, apagarEnsinamento, VALIDADE_ANALISE_MS } from '@/lib/mecanicos/analise-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ACESSO = [{ modulo: 'mecanicos' }, { modulo: 'pos' }]
const erro = (e: unknown, status = 500) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, ACESSO)
  if (guarda.resposta) return guarda.resposta
  try {
    const [ultima, ensinamentos] = await Promise.all([ultimaAnalise(), listarEnsinamentos()])
    const velha = !ultima || Date.now() - Date.parse(ultima.geradaEm) > VALIDADE_ANALISE_MS
    if (velha && !estaGerando()) {
      const auth = await autenticar(req)
      if (auth) gerarUmaVez(auth, 'Tratorilson (automático)').catch((e) => console.error('[mecanicos/analise] automática', e))
    }
    return NextResponse.json({ ultima, ensinamentos, gerando: estaGerando() })
  } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, ACESSO)
  if (guarda.resposta) return guarda.resposta
  const body = await req.json().catch(() => ({}))
  const acao = String(body?.acao || '')
  const autor = autorDe(guarda.user)
  const conteudo = String(body?.conteudo || '').trim().slice(0, 2000)
  const id = Number(body?.id)
  try {
    if (acao === 'analisar') {
      const auth = await autenticar(req)
      if (!auth) return erro('Sessão expirada.', 401)
      return NextResponse.json({ ultima: await gerarUmaVez(auth, autor) })
    }
    if (acao === 'ensinar') {
      if (conteudo.length < 5) return erro('Escreva o ensinamento.', 400)
      await ensinar(conteudo, autor)
    } else if (acao === 'editar') {
      if (!Number.isFinite(id) || conteudo.length < 5) return erro('Ensinamento inválido.', 400)
      await editarEnsinamento(id, conteudo)
    } else if (acao === 'apagar') {
      if (!Number.isFinite(id)) return erro('Ensinamento inválido.', 400)
      await apagarEnsinamento(id)
    } else return erro('Ação desconhecida.', 400)
    return NextResponse.json({ ensinamentos: await listarEnsinamentos() })
  } catch (e) {
    console.error('[mecanicos/analise]', e)
    return erro(e)
  }
}
