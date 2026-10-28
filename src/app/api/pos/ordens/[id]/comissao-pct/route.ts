// % de comissão da OS (José, 20/10/2026): o pós-vendas muda a % daquele serviço e, se for diferente da % dos
// técnicos, diz por quê. GET = situação + % de cada técnico + histórico · PUT {pcts: {técnico: %} | pct | null, motivo}.
// Desde 22/10/2026 cada técnico da OS pode ter a sua % (coluna pcts — sql/posvendas-comissao-os.sql, fim do arquivo).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarPctComissao } from '@/lib/mecanicos/gastos-server'
import { padronizadorOcorrencias } from '@/lib/mecanicos/ocorrencias-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Rec = Record<string, unknown>
const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find/i.test(e.message || ''))
const SEM_SQL = 'Falta rodar o SQL sql/posvendas-comissao-os.sql'

async function tecnicosDaOS(id: string) {
  const { data } = await sb.from('Ordem_Servico').select('Os_Tecnico, Os_Tecnico2').eq('Id_Ordem', id).maybeSingle()
  const { padronizar } = await padronizadorOcorrencias()
  const nomes = [...new Set([(data as Rec | null)?.Os_Tecnico, (data as Rec | null)?.Os_Tecnico2].map(padronizar).filter(Boolean))] as string[]
  const pct = await carregarPctComissao(padronizar, new Set(nomes)).catch(() => ({} as Record<string, number>))
  return nomes.map((nome) => ({ nome, pct: pct[nome] ?? null }))
}

const semPcts = (e: { message?: string } | null) => !!e && /pcts/.test(e.message || '')
const SEM_SQL_PCTS = 'Para uma % diferente por técnico falta rodar o fim do SQL sql/posvendas-comissao-os.sql (coluna pcts).'
const num = (v: unknown) => (v == null || v === '' ? null : Math.round(Number(String(v).replace(',', '.')) * 100) / 100)

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  const tecnicos = await tecnicosDaOS(id)
  let r = await sb.from('posvendas_comissao_os').select('pct, pcts, motivo, alterado_por, alterado_em').eq('id_ordem', id).maybeSingle()
  let porTecnico = true
  if (r.error && semPcts(r.error)) { porTecnico = false; r = await sb.from('posvendas_comissao_os').select('pct, motivo, alterado_por, alterado_em').eq('id_ordem', id).maybeSingle() }
  if (r.error && falta(r.error)) return NextResponse.json({ semTabela: true, erro: SEM_SQL, tecnicos })
  const { data: log } = await sb.from('posvendas_comissao_os_log').select('*').eq('id_ordem', id).order('em', { ascending: false }).limit(20)
  return NextResponse.json({ atual: r.data || null, tecnicos, log: log || [], porTecnico })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  const b = await req.json().catch(() => ({}))
  const motivo = String(b.motivo || '').trim()
  const tecnicos = await tecnicosDaOS(id)
  // pcts {nome: %} (um por técnico) ou pct único (o jeito antigo) ou null (volta para a % de cada técnico)
  let pcts: Record<string, number> | null = null
  if (b.pcts && typeof b.pcts === 'object') {
    pcts = {}
    for (const t of tecnicos) { const v = num((b.pcts as Rec)[t.nome]); if (v != null) pcts[t.nome] = v }
    if (!Object.keys(pcts).length) pcts = null
  } else if (b.pct != null && b.pct !== '') {
    const v = num(b.pct); pcts = Object.fromEntries(tecnicos.map((t) => [t.nome, v as number]))
    if (!tecnicos.length && v != null) pcts = { _: v }
  }
  if (pcts && Object.values(pcts).some((v) => !(v >= 0 && v <= 100))) return NextResponse.json({ erro: 'A % tem que ficar entre 0 e 100' }, { status: 400 })
  const diferente = !!pcts && tecnicos.some((t) => pcts![t.nome] != null && (t.pct == null || Math.abs(t.pct - pcts![t.nome]) > 0.001))
  if ((diferente || !pcts) && !motivo) return NextResponse.json({ erro: !pcts ? 'Diga por que voltou para a % de cada técnico' : 'A % é diferente da dos técnicos — diga por quê' }, { status: 400 })
  const valores = pcts ? Object.values(pcts) : []
  const unica = valores.length ? valores[0] : null
  const todasIguais = valores.every((v) => Math.abs(v - (unica as number)) < 0.001)

  let antes = await sb.from('posvendas_comissao_os').select('pct, pcts').eq('id_ordem', id).maybeSingle()
  const temColuna = !semPcts(antes.error)
  if (!temColuna) antes = await sb.from('posvendas_comissao_os').select('pct').eq('id_ordem', id).maybeSingle()
  if (antes.error && falta(antes.error)) return NextResponse.json({ erro: SEM_SQL, semTabela: true }, { status: 503 })
  if (!temColuna && pcts && !todasIguais) return NextResponse.json({ erro: SEM_SQL_PCTS }, { status: 503 })
  const autor = autorDe(g.user!)
  if (!pcts) {
    const { error } = await sb.from('posvendas_comissao_os').delete().eq('id_ordem', id)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  } else {
    const linha: Rec = { id_ordem: id, pct: unica, motivo: motivo || 'igual à % dos técnicos', alterado_por: autor, alterado_por_id: g.user!.id, alterado_em: new Date().toISOString() }
    if (temColuna) linha.pcts = pcts._ != null ? null : pcts
    const { error } = await sb.from('posvendas_comissao_os').upsert(linha)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  }
  const a = antes.data as Rec | null
  const log: Rec = { id_ordem: id, pct_de: a?.pct ?? null, pct_para: unica, motivo: motivo || null, autor, autor_id: g.user!.id }
  if (temColuna) { log.pcts_de = a?.pcts ?? null; log.pcts_para = pcts && pcts._ == null ? pcts : null }
  await sb.from('posvendas_comissao_os_log').insert(log).then((x) => { if (x.error && temColuna) { delete log.pcts_de; delete log.pcts_para; return sb.from('posvendas_comissao_os_log').insert(log) } }, () => {})
  return NextResponse.json({ ok: true })
}
