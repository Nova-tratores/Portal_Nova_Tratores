// GET /api/empresa/requisicoes — todas as requisições (menos a lixeira), para a área
// Requisições do /empresa (José, 12/11: "cartões com assuntos das requisições: quanto gastou, qual setor mais gastou,
// dentro de cada setor quem mais gastou, quantas estão paradas"). Só lê a tabela Requisicao; a lixeira fica de fora.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

// "124.25" (número) ou "1.234,56" (texto BR)
const num = (v: unknown) => { const t = String(v ?? '').trim(); if (!t) return 0; return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0 }

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const cols = 'id, titulo, tipo, solicitante, setor, data, status, valor_despeza, valor_cobrado_cliente, fornecedor, ordem_servico, veiculo, cliente, created_at, foto_nf'
  const linhas: Array<Record<string, unknown>> = []
  for (let a = 0; ; a += 1000) {
    const { data, error } = await supabaseAdmin.from('Requisicao').select(cols).neq('status', 'lixeira')
      .order('id', { ascending: false }).range(a, a + 999)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    linhas.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  const reqs = linhas.map((r) => ({
    id: Number(r.id), titulo: String(r.titulo || '').trim(), tipo: String(r.tipo || 'Outros').trim(), pessoa: String(r.solicitante || 'sem solicitante').trim(),
    setor: String(r.setor || 'Sem setor').trim(), data: String(r.data || r.created_at || '').slice(0, 10), status: String(r.status || ''),
    valor: num(r.valor_despeza), cobrado: num(r.valor_cobrado_cliente), fornecedor: String(r.fornecedor || '').trim(), os: String(r.ordem_servico || '').trim(),
    veiculo: String(r.veiculo || '').trim(), cliente: String(r.cliente || '').trim(), temNota: !!r.foto_nf,
  }))
  return NextResponse.json({ reqs, hoje: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) }, { headers: { 'Cache-Control': 'private, max-age=120' } })
}
