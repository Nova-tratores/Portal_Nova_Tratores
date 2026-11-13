// GET /api/empresa/frota-manutencoes — as manutenções dos últimos 12 meses de todos os carros (vw_frota_manutencoes: Rota
// Exata ∪ lançadas à mão ∪ requisições "Veicular Manutenção", a mesma visão do Frota → Manutenções), para a aba
// Manutenções e revisões do /empresa (José, 12/11). Só lê.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const de = new Date(); de.setMonth(de.getMonth() - 12); de.setDate(1)
  const linhas: Array<Record<string, unknown>> = []
  for (let a = 0; ; a += 1000) {
    const { data, error } = await supabaseAdmin.from('vw_frota_manutencoes').select('id, placa, origem, tipo, status, descricao, fornecedor, valor_total, data, hodometro')
      .gte('data', de.toISOString().slice(0, 10)).order('data', { ascending: false }).range(a, a + 999)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    linhas.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return NextResponse.json({ manutencoes: linhas }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
