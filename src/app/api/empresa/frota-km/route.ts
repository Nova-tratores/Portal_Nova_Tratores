// GET /api/empresa/frota-km?mes=2026-11 — quantos km cada carro rodou no mês pelo RASTREADOR (frota_dias, o mesmo
// número da Frota), para cruzar com os litros abastecidos na aba Abastecimentos do /empresa (José, 12/11: "consegue
// cruzar quantos km ele rodou entre os abastecimentos?"). O km/l do módulo usa o hodômetro DIGITADO na bomba; este usa
// o GPS, que não depende de ninguém digitar. Só lê tabela.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const mes = String(req.nextUrl.searchParams.get('mes') || '')
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ erro: 'Mês inválido.' }, { status: 400 })
  const [a, m] = mes.split('-').map(Number)
  const fim = new Date(a, m, 0).getDate()
  const [veic, dias] = await Promise.all([
    supabaseAdmin.from('frota_veiculos').select('id, placa, tem_rastreador, adesao_id'),
    supabaseAdmin.from('frota_dias').select('veiculo_id, data, km_total, km_odometro, posicoes_total').gte('data', `${mes}-01`).lte('data', `${mes}-${String(fim).padStart(2, '0')}`).limit(5000),
  ])
  if (dias.error) return NextResponse.json({ erro: dias.error.message }, { status: 500 })
  const placaDe = new Map((veic.data || []).map((v) => [String(v.id), String(v.placa)]))
  const out: Record<string, { km: number; dias: number }> = {}
  for (const d of dias.data || []) {
    const placa = placaDe.get(String(d.veiculo_id))
    if (!placa) continue
    const km = Number(d.km_odometro ?? d.km_total ?? 0) || 0
    const x = out[placa] || (out[placa] = { km: 0, dias: 0 })
    x.km += km
    if (km > 0.5) x.dias++
  }
  for (const k of Object.keys(out)) out[k].km = Math.round(out[k].km)
  const comRastreador = (veic.data || []).filter((v) => Number(v.adesao_id) > 0).map((v) => String(v.placa))
  return NextResponse.json({ mes, porPlaca: out, comRastreador }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
