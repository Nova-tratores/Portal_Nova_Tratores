// Livro de Decisões — job de compromissos (Visão C). Varre pareceres com
// prazo_compromisso vencido cuja SC não chegou ao PC e alerta os envolvidos.
// Chamado por GitHub Actions (.github/workflows/decisoes-compromissos.yml)
// com x-cron-secret. Só notifica (não escreve no ledger — evita ruído mensal).
import { NextRequest, NextResponse } from 'next/server'
import { compromissosVencidos, notificarDecisao, usuariosComPapel } from '@/lib/decisoes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function executar(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ ok: false, erro: 'unauthorized' }, { status: 401 })
  }

  const vencidos = await compromissosVencidos()
  if (vencidos.length === 0) return NextResponse.json({ ok: true, vencidos: 0, notificados: 0 })

  const diretoria = await usuariosComPapel('diretoria_compras')
  const financeiro = await usuariosComPapel('financeiro')
  let notificados = 0
  for (const v of vencidos) {
    const alvo = [...new Set([v.sc.vendedor_id, ...diretoria, ...financeiro, ...(v.decisao.ator_id ? [v.decisao.ator_id] : [])])]
    await notificarDecisao(
      v.sc, alvo, null,
      `Compromisso vencido — SC #${v.sc.numero}`,
      `Parecer previa liquidação até ${v.decisao.prazo_compromisso}; ${v.dias_atraso} dia(s) de atraso e a SC segue "${v.sc.status}".`,
    )
    notificados++
  }
  return NextResponse.json({ ok: true, vencidos: vencidos.length, notificados })
}

export async function POST(req: NextRequest) { return executar(req) }
export async function GET(req: NextRequest) { return executar(req) }
