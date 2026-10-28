// Liga e XP do técnico LOGADO, para a tela inicial do app dos técnicos (José, 22/10/2026: "troca esse bloco de
// informações para o XP e liga dele que tá no portal"). O app chama com o token do mesmo Supabase.
// GET → { tecnico, nivel, patente, saldo (XP), proximo, faltam, mes: {ganhos, osLimpas, descontos, ocorrencias} }
import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carreiraEComissoes } from '@/lib/mecanicos/carreira-server'
import { padronizadorOcorrencias } from '@/lib/mecanicos/ocorrencias-server'
import { patente, NIVEL_MAX, PONTOS_POR_DEGRAU, PONTOS_POR_OS } from '@/lib/mecanicos/carreira'
import { corsAppMecanicos } from '@/lib/mecanicos/cors-app'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsAppMecanicos(req) })
}

export async function GET(req: Request) {
  const cors = corsAppMecanicos(req)
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: cors })
  const { data: perm } = await sb.from('portal_permissoes').select('mecanico_tecnico_nome').eq('user_id', auth.userId).maybeSingle()
  const nomeApp = String((perm as { mecanico_tecnico_nome?: string } | null)?.mecanico_tecnico_nome || '').trim()
  if (!nomeApp) return NextResponse.json({ semLiga: true, motivo: 'usuário sem nome de técnico' }, { headers: cors })
  const { padronizar } = await padronizadorOcorrencias()
  const tecnico = padronizar(nomeApp)
  const r = await carreiraEComissoes()
  const c = r.carreira.find((x) => x.tecnico === tecnico)
  if (!c) return NextResponse.json({ semLiga: true, tecnico, motivo: 'ainda sem OS fechada na liga' }, { headers: cors })
  const pt = patente(c.seFecharAssim)
  const prox = c.seFecharAssim < NIVEL_MAX ? patente(c.seFecharAssim + 1) : null
  const ranking = r.carreira.map((x) => x.tecnico).indexOf(tecnico) + 1
  return NextResponse.json({
    tecnico,
    nivel: c.seFecharAssim,
    patente: { nome: pt.nome, divisao: pt.divisao, cor: pt.cor, fundo: pt.fundo },
    saldo: c.saldoAgora,
    proximo: prox ? { nome: prox.nome, cor: prox.cor } : null,
    faltam: c.faltaProximo,
    // quanto do degrau atual já andou (0–1)
    progresso: prox ? Math.max(0, Math.min(1, (c.saldoAgora - c.seFecharAssim * PONTOS_POR_DEGRAU) / PONTOS_POR_DEGRAU)) : 1,
    mes: { ganhos: c.mesAtual.ganhos, osLimpas: c.mesAtual.osLimpas, descontos: c.mesAtual.pontos, ocorrencias: c.mesAtual.qtd },
    ranking, total: r.carreira.length,
    regra: { porOS: PONTOS_POR_OS, porDegrau: PONTOS_POR_DEGRAU },
  }, { headers: cors })
}
