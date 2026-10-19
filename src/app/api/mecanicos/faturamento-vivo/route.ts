// Faturamento do pós-vendas AO VIVO (José, 16/10/2026): hoje, semana (seg–dom) e mês —
// bruto, custo de terceiros (requisições da OS) e líquido, separado em serviço/km/peças —
// e os últimos faturamentos. A tela consulta a cada 20 s.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { carregarBase } from '@/lib/mecanicos/painel-server'
import { comCache } from '@/lib/mecanicos/cache'
import { segundaDa, type OSFaturada } from '@/lib/mecanicos/painel'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { parseValorMisto } from '@/lib/marketing/custos'
import { carregarDiretorio } from '@/lib/agenda/server'

/** Requisição ligada à OS (para o feed): cobrada ou não do cliente; alimentação vira "almoço". */
export interface ReqDaOS { id: number; tipo: string; titulo: string; valor: number; cobrado: number; status: string; nota: string | null }

/** Requisições das OS do feed + fotos dos técnicos (José, 17/10/2026: "foto do técnico, valor hr, km,
 *  peças e requisições se tiver, almoço também"). */
async function extrasDoFeed(ultimos: OSFaturada[]) {
  const ids = ultimos.map((o) => o.os).filter((id) => !id.startsWith('OMIE'))
  const extras: Record<string, { reqs: ReqDaOS[]; almoco: ReqDaOS[] }> = {}
  if (ids.length) {
    const { data } = await sb.from('Requisicao').select('id, ordem_servico, tipo, titulo, valor_despeza, valor_cobrado_cliente, status, foto_nf').in('ordem_servico', ids)
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (/lixeira|cancel/i.test(String(r.status || ''))) continue
      const x = (extras[String(r.ordem_servico)] ||= { reqs: [], almoco: [] })
      const item: ReqDaOS = { id: Number(r.id), tipo: String(r.tipo || ''), titulo: String(r.titulo || ''), valor: parseValorMisto(r.valor_despeza), cobrado: parseValorMisto(r.valor_cobrado_cliente), status: String(r.status || ''), nota: r.foto_nf ? String(r.foto_nf) : null }
      if (/aliment/i.test(item.tipo)) x.almoco.push(item); else x.reqs.push(item)
    }
  }
  const fotos: Record<string, string> = {}
  try {
    const dir = await carregarDiretorio()
    const nomes = new Set(ultimos.flatMap((o) => o.tecnicos))
    for (const p of dir.pessoas) if (p.avatar_url && nomes.has(p.nome)) fotos[p.nome] = p.avatar_url
  } catch { /* sem fotos: iniciais */ }
  return { extras, fotos }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function somar(os: OSFaturada[]) {
  const t = { os: os.length, servico: 0, kmValor: 0, pecas: 0, outros: 0, bruto: 0, custo: 0, liquido: 0, horas: 0, km: 0 }
  for (const o of os) { t.servico += o.servico; t.kmValor += o.kmValor; t.pecas += o.pecas; t.outros += o.outros; t.bruto += o.bruto; t.custo += o.custo; t.horas += o.horasCobradas; t.km += o.km }
  t.liquido = t.bruto - t.custo
  for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = Math.round(t[k] * 100) / 100
  return t
}

async function montar() {
  const hoje = hojeSP()
  const ini = hoje.slice(0, 8) + '01'
  const seg = segundaDa(hoje)
  const de = seg < ini ? seg : ini
  const base = await carregarBase(de, hoje)
  const fat = base.faturadas
  const mes = fat.filter((o) => o.data >= ini)
  const ultimos = [...fat].sort((a, b) => (b.em || `${b.data}T12:00`).localeCompare(a.em || `${a.data}T12:00`)).slice(0, 15)
  const { extras, fotos } = await extrasDoFeed(ultimos).catch(() => ({ extras: {}, fotos: {} }))
  // dia a dia do mês (gráfico)
  const porDia: Record<string, { bruto: number; liquido: number }> = {}
  for (const o of mes) { const d = (porDia[o.data] ||= { bruto: 0, liquido: 0 }); d.bruto += o.bruto; d.liquido += o.bruto - o.custo }
  return {
    agora: new Date().toISOString(), hoje,
    dia: somar(fat.filter((o) => o.data === hoje)),
    semana: somar(fat.filter((o) => o.data >= seg)),
    mes: somar(mes),
    porDia: Object.entries(porDia).sort().map(([data, v]) => ({ data, bruto: Math.round(v.bruto * 100) / 100, liquido: Math.round(v.liquido * 100) / 100 })),
    ultimos, extras, fotos,
  }
}

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  try {
    // gravado em posvendas_painel_cache; recalculado por trás quando passa de 60 s.
    // A chave leva o dia: virou o dia, semana e mês recomeçam.
    const r = await comCache(`vivo2:${hojeSP()}`, 60_000, montar, req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json({ ...r.dados, geradoEm: r.geradoEm })
  } catch (e) {
    console.error('[mecanicos/faturamento-vivo]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 })
  }
}
