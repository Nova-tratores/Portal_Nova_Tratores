// Relatório do técnico de uma OS, para abrir junto com a OS na comissão (José, 29/10/2026: "clicar em qualquer lugar abre
// a ordem, e não só a ordem, já vem o relatório do técnico também"). GET ?os=OS-0826 → o que ele escreveu + o PDF enviado.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { diasDoRelatorio, type RelatorioTecnico } from '@/lib/pos/horas-tecnico'

export const dynamic = 'force-dynamic'

type Rec = Record<string, unknown>

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  const os = String(req.nextUrl.searchParams.get('os') || '').trim()
  if (!/^OS-\d+$/i.test(os)) return NextResponse.json({ relatorio: null, pdf: null })
  const [{ data: rels }, { data: ordem }] = await Promise.all([
    sb.from('Ordem_Servico_Tecnicos').select('*').eq('Ordem_Servico', os).order('IdOs', { ascending: false }).limit(5),
    sb.from('Ordem_Servico').select('ID_Relatorio_Final, Os_Cliente').eq('Id_Ordem', os).maybeSingle(),
  ])
  const ls = (rels || []) as Rec[]
  const r = ls.find((x) => String(x.Status || '').toLowerCase() === 'enviado') || ls[0] || null
  const pdf = String((ordem as Rec | null)?.ID_Relatorio_Final || '').trim()
  return NextResponse.json({
    pdf: /^https?:\/\//.test(pdf) ? pdf : null,
    relatorio: r ? {
      status: r.Status || null, tecnico: r.TecResp1 || null, tecnico2: r.TecResp2 || null, modelo: r.Modelo || null, tipo: r.TipoServico || null,
      motivo: r.Motivo || null, servico: r.ServicoRealizado || null, horas: r.TotalHora || null, km: r.TotalKm || null,
      dias: diasDoRelatorio(r as unknown as RelatorioTecnico).map((d) => ({ data: d.data, horas: d.horas })),
    } : null,
  })
}
