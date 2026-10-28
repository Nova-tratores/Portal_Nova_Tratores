// Previsão de horas da OS pelo tempário Mahindra + avisos (José, 20/10/2026). GET = guardada ou calcula;
// GET ?refazer=1 = recalcula.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { preverOS, relatorioDaOS } from '@/lib/mecanicos/previsao-os-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  try {
    const os = decodeURIComponent(id)
    const p = await preverOS(os, { forcar: req.nextUrl.searchParams.get('refazer') === '1' })
    // ?relatorio=1: o que o técnico escreveu (o tempário mostra ao lado das atividades — José, 28/10/2026)
    if (req.nextUrl.searchParams.get('relatorio') !== '1') return NextResponse.json({ previsao: p })
    const rel = await relatorioDaOS(os)
    return NextResponse.json({ previsao: p, relatorio: rel ? { motivo: rel.Motivo || null, servico: rel.ServicoRealizado || null, horas: rel.TotalHora || null, tecnico: rel.TecResp1 || null, modelo: rel.Modelo || null, tipo: rel.TipoServico || null } : null })
  } catch (e) { return NextResponse.json({ previsao: null, erro: e instanceof Error ? e.message : 'Falha' }) }
}
