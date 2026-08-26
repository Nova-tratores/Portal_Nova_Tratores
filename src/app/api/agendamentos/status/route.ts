// =============================================================================
// API: agendamentos/status - status ao vivo dos crons a partir da GitHub Actions.
// Serve de proxy para a tela /agendamentos: o GITHUB_TOKEN nunca vai ao cliente.
// Uma unica chamada lista os runs recentes e reduzimos a ULTIMA execucao por
// workflow (agrupado por run.path = ".github/workflows/xxx.yml"), que casa com
// registry.arquivo. "Sucesso" aqui = a chamada agendada retornou 2xx (os crons
// sao fire-and-forget; o processamento roda em background) - ja pega 502/timeout.
// =============================================================================
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const REPO = process.env.GITHUB_REPO || 'Nova-tratores/Portal_Nova_Tratores'

type RunInfo = {
  conclusion: string | null   // success | failure | cancelled | skipped | null (em andamento)
  status: string              // completed | in_progress | queued
  createdAt: string
  htmlUrl: string
  event: string
  runNumber: number
}

// Cache em memoria (por processo) para nao bater na API a cada refresh.
let cache: { ts: number; payload: unknown } | null = null
const TTL_MS = 60_000

export async function GET() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, motivo: 'GITHUB_TOKEN ausente', repo: REPO })
  }

  if (cache && Date.now() - cache.ts < TTL_MS) {
    return NextResponse.json(cache.payload)
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/runs?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, motivo: `GitHub API ${res.status}`, detalhe: txt.slice(0, 200), repo: REPO })
    }
    const data = await res.json()
    const runs: Record<string, RunInfo> = {}
    for (const r of (data.workflow_runs || [])) {
      const path: string = r.path // ".github/workflows/xxx.yml"
      if (!path) continue
      const anterior = runs[path]
      if (!anterior || new Date(r.created_at) > new Date(anterior.createdAt)) {
        runs[path] = {
          conclusion: r.conclusion ?? null,
          status: r.status,
          createdAt: r.created_at,
          htmlUrl: r.html_url,
          event: r.event,
          runNumber: r.run_number,
        }
      }
    }
    const payload = { ok: true, repo: REPO, runs, atualizadoEm: new Date().toISOString() }
    cache = { ts: Date.now(), payload }
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: (e as Error).message, repo: REPO })
  }
}
