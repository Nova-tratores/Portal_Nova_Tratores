// War Room — cron do SNAPSHOT semanal. Roda segunda 06h BRT (GitHub Actions,
// .github/workflows/war-room-snapshot.yml) com x-cron-secret. Cria o snapshot
// da semana que ACABOU DE FECHAR (segunda anterior → domingo), pré-preenchendo
// o que é derivável (origem='auto'); o caixa fica manual. IDEMPOTENTE: rodar 2×
// na mesma segunda não duplica (UNIQUE em semana_inicio + pré-checagem).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { snapshotSemanal } from '@/lib/war-room/snapshot'
import { segundaDaSemana } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Segunda anterior à segunda de `semana` (YYYY-MM-DD) — a semana já completa.
function semanaAnterior(segundaAtual: string): string {
  const [y, m, d] = segundaAtual.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) - 7 * 86400000)
  return dt.toISOString().slice(0, 10)
}

async function executar(req: NextRequest) {
  // Fail-closed: sem CRON_SECRET configurado no ambiente, a rota RECUSA tudo
  // (nunca fica pública). Exige o header/secret correto quando configurado.
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, erro: 'unauthorized' }, { status: 401 })
  }

  // Semana a reportar: override por ?semana=, senão a semana completa anterior.
  const override = req.nextUrl.searchParams.get('semana')
  const semanaInicio = override || semanaAnterior(segundaDaSemana(new Date()))

  // Idempotência: se já existe snapshot dessa semana, não recria.
  const { data: existente } = await supabaseAdmin
    .from('war_room_snapshots').select('id, fechado_em').eq('semana_inicio', semanaInicio).maybeSingle()
  if (existente) {
    return NextResponse.json({ ok: true, created: false, semana_inicio: semanaInicio, motivo: 'já existe' })
  }

  const snap = await snapshotSemanal(semanaInicio, { origin: req.nextUrl.origin })

  const { error } = await supabaseAdmin.from('war_room_snapshots').insert({
    semana_inicio: snap.semana_inicio,
    margem_semana: snap.margem_semana,
    tratores_vendidos: snap.tratores_vendidos,
    entradas_patio: snap.entradas_patio,
    volume_antecipado: snap.volume_antecipado,
    caixa_30d: snap.caixa_30d,
    caixa_60d: snap.caixa_60d,
    caixa_90d: snap.caixa_90d,
    farol_margem: snap.farol_margem,
    farol_giro: snap.farol_giro,
    farol_caixa: snap.farol_caixa,
    origem: snap.origem,
  })
  // Corrida: outra execução criou no meio → trata como idempotente.
  if (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate') || error.code === '23505') {
      return NextResponse.json({ ok: true, created: false, semana_inicio: semanaInicio, motivo: 'corrida' })
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, created: true, semana_inicio: semanaInicio,
    pendentes_automacao: snap.pendentes_automacao,
  })
}

export async function POST(req: NextRequest) { return executar(req) }
export async function GET(req: NextRequest) { return executar(req) }
