// GET /api/empresa/rota?placa=SEB9J47&data=2026-11-12 — a rota de um dia do carro do vendedor (pontos do rastreador,
// paradas e horários) para o mapa da tela do diretor (/empresa → Vendedores → Carro e rotas).
// José, 12/11: "mostrar o mapa diário, inclusive onde ele está agora; voltando o dia, troca a rota; filtro por dia,
// mês e entre horas". Mesma função do Frota/Supervisor (computarESalvarRota): dia passado vem do cache em
// rotas_vendedor; hoje busca no rastreador na hora (o último ponto é onde o carro está agora).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { computarESalvarRota } from '@/lib/pos/rastreamento'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const placa = (req.nextUrl.searchParams.get('placa') || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const data = req.nextUrl.searchParams.get('data') || ''
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ erro: 'Placa ou data inválida.' }, { status: 400 })
  try {
    const r = await computarESalvarRota(supabaseAdmin, placa, data)
    return NextResponse.json({
      placa, data, km: r.km_total, inicio: r.hora_inicio, fim: r.hora_fim, dirigindo: r.tempo_dirigindo_min, parado: r.tempo_parado_min,
      pontos: (r.pontos || []).map((p) => [p.lat, p.lng, p.dt, p.vel, p.ignicao]),
      paradas: r.paradas || [], visitas: r.visitas || [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }
}
