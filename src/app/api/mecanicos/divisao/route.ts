// Salvar a divisão de uma OS entre técnicos (José, 29/10/2026: "tem que salvar para o usuário ter certeza de que foi").
// POST grava (uma por OS no mês), DELETE desfaz. Tabela: sql/posvendas-divisoes.sql (projeto do portal).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { esquecer } from '@/lib/mecanicos/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEM_TABELA = 'Falta rodar o SQL sql/posvendas-divisoes.sql no Supabase do portal.'
const semTabela = (m: string) => /posvendas_divisoes|relation .* does not exist|PGRST205/i.test(m)
const numeros = (o: unknown): Record<string, number> => Object.fromEntries(Object.entries((o || {}) as Record<string, unknown>).map(([k, v]) => [String(k), Math.round((Number(v) || 0) * 100) / 100]).filter(([, v]) => (v as number) >= 0))

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const b = await req.json().catch(() => ({}))
  const mes = String(b.mes || ''), numero = String(b.numero || b.os || ''), de = String(b.de || '')
  if (!/^\d{4}-\d{2}$/.test(mes) || !numero || !de) return NextResponse.json({ error: 'Dados da divisão incompletos' }, { status: 400 })
  const valores = numeros(b.valores), horas = b.horas ? numeros(b.horas) : null
  if (!Object.keys(valores).length) return NextResponse.json({ error: 'Marque pelo menos um técnico' }, { status: 400 })
  if (horas && b.horasOS != null && Object.values(horas).reduce((a, v) => a + v, 0) > Number(b.horasOS) + 0.05) return NextResponse.json({ error: 'As horas passam do total da OS' }, { status: 400 })
  const { data, error } = await sb.from('posvendas_divisoes').upsert({
    mes, os: String(b.os || numero), numero, de_tecnico: de, horas, valores, motivo: String(b.motivo || '').slice(0, 300),
    salvo_por: g.user.email || g.user.id, salvo_por_id: g.user.id, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'mes,numero' }).select('atualizado_em').single()
  if (error) return NextResponse.json({ error: semTabela(error.message) ? SEM_TABELA : error.message, semTabela: semTabela(error.message) }, { status: semTabela(error.message) ? 503 : 500 })
  await esquecer([...new Set([de, ...Object.keys(valores)])].map((n) => `ficha13:${n}:`)).catch(() => {})
  return NextResponse.json({ ok: true, em: (data as { atualizado_em: string }).atualizado_em })
}

export async function DELETE(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const mes = req.nextUrl.searchParams.get('mes') || '', numero = req.nextUrl.searchParams.get('numero') || ''
  if (!mes || !numero) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  const { data: velha } = await sb.from('posvendas_divisoes').select('de_tecnico, valores').eq('mes', mes).eq('numero', numero).maybeSingle()
  const { error } = await sb.from('posvendas_divisoes').delete().eq('mes', mes).eq('numero', numero)
  if (error) return NextResponse.json({ error: semTabela(error.message) ? SEM_TABELA : error.message }, { status: 500 })
  if (velha) await esquecer([String(velha.de_tecnico), ...Object.keys((velha.valores || {}) as object)].map((n) => `ficha13:${n}:`)).catch(() => {})
  return NextResponse.json({ ok: true })
}
