// IDEIAS — ações novas (melhorias 5.2 e 5.3, 25/11/2026). Só Dev, como o resto das ideias.
// POST /api/dev/ideias/acoes
//   { acao:'votar', ideia_id }          -> { votos: ids }                 (👍 liga/desliga; sql/ideias-votos.sql)
//   { acao:'parecidos', texto }         -> { parecidos: [{id,numero,titulo,comuns}] }
//        pedidos ABERTOS que quem pergunta vê, parecidos com a ideia (palavras em comum, sem IA)
//   { acao:'sugerir_grupos' }           -> { grupos: [{ nome, ideias: ids }] }
//        IA (só com IDEIAS_IA=1 no servidor). A chave fica SÓ no servidor (lib/assistente/ia.ts, a
//        mesma do assistente); o custo de cada chamada vai para o log. Só PROPÕE: a tela cria o grupo
//        quando a pessoa aceita.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { chamarIA, getIA } from '@/lib/assistente/ia'
import { parecidos, IDEIA_MAX } from '@/lib/dev/ideias'
import { alternarVoto, listarTudo, pedidosAbertosVisiveis, uuidValido, migrationFaltou } from '@/lib/dev/ideias-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
// gpt-4o-mini (US$ por 1 milhão de tokens) — só para o log de custo; outro modelo registra os tokens.
const PRECO: Record<string, { entrada: number; saida: number }> = { 'gpt-4o-mini': { entrada: 0.15, saida: 0.6 } }

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!auth.isDev) return erro('Só o Dev acessa as ideias.', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (body.acao === 'votar') {
      if (!uuidValido(body.ideia_id)) return erro('Ideia inválida')
      return NextResponse.json({ votos: await alternarVoto(body.ideia_id, auth.userId) })
    }

    if (body.acao === 'parecidos') {
      const texto = String(body.texto || '').slice(0, IDEIA_MAX)
      return NextResponse.json({ parecidos: parecidos(texto, await pedidosAbertosVisiveis(auth.userId)) })
    }

    if (body.acao === 'sugerir_grupos') {
      if (process.env.IDEIAS_IA !== '1') return erro('A sugestão por IA está desligada (IDEIAS_IA=1 no servidor liga).', 403)
      const { ideias } = await listarTudo(false)
      const soltas = ideias.filter((i) => !i.grupo_id && !i.arquivada).slice(0, 80)
      if (soltas.length < 3) return erro('Precisa de pelo menos 3 ideias soltas para sugerir grupos.')
      const lista = soltas.map((i, k) => `${k + 1}. ${i.texto.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
      const inicio = Date.now()
      const r = await chamarIA({
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Você organiza ideias de melhoria de um portal interno de uma revenda de tratores. Junte as ideias que tratam do MESMO assunto em grupos de 2 ou mais. Ideia que não combina com nenhuma fica de fora. Cada grupo ganha um nome curto em português (até 6 palavras). Responda só JSON: {"grupos":[{"nome":"...","ideias":[números]}]}.' },
          { role: 'user', content: lista },
        ],
      }) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string }
      // custo por chamada no log (melhorias 5.3)
      const modelo = r.model || getIA().model
      const p = PRECO[Object.keys(PRECO).find((m) => modelo.startsWith(m)) || '']
      const tokIn = r.usage?.prompt_tokens || 0, tokOut = r.usage?.completion_tokens || 0
      const usd = p ? (tokIn * p.entrada + tokOut * p.saida) / 1e6 : null
      console.info('[ideias/ia] sugerir_grupos', { modelo, ideias: soltas.length, tokIn, tokOut, usd, ms: Date.now() - inicio })
      await registrarAuditLog({ userId: auth.userId, userName: auth.email || 'dev', sistema: 'ideias', acao: 'ia_sugerir_grupos', entidade: 'dev_ideias', detalhes: { modelo, ideias: soltas.length, tokIn, tokOut, usd } }).catch(() => {})

      let bruto: { grupos?: { nome?: unknown; ideias?: unknown }[] } = {}
      try { bruto = JSON.parse(r.choices?.[0]?.message?.content || '{}') } catch { return erro('A IA respondeu num formato inesperado. Tente de novo.', 502) }
      const usadas = new Set<number>()
      const grupos = (bruto.grupos || []).map((g) => {
        const nums = (Array.isArray(g.ideias) ? g.ideias : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= soltas.length && !usadas.has(n))
        nums.forEach((n) => usadas.add(n))
        return { nome: String(g.nome || '').trim().slice(0, 120) || 'Grupo', ideias: nums.map((n) => soltas[n - 1].id) }
      }).filter((g) => g.ideias.length >= 2)
      return NextResponse.json({ grupos, usd })
    }

    return erro('Ação desconhecida')
  } catch (e) {
    if (migrationFaltou(e)) return erro('Rode sql/ideias-votos.sql no Supabase (votos das ideias).', 503)
    console.error('[dev/ideias/acoes]', e)
    return erro(e instanceof Error && /^ia /.test(e.message) ? 'A IA não respondeu agora. Tente de novo em instantes.' : 'Não deu certo', 500)
  }
}
