// POPs — painel por área.
// GET /api/pops/painel?area=<uuid>&dias=30
// Contagens e percentuais SEMPRE no banco (pops_painel_area) — nunca somando
// linhas puxadas (o PostgREST corta em 1000). As listas abaixo são só para
// exibir (limitadas e ordenadas), não entram em conta nenhuma.
// Quem vê: quem tem o módulo de POPs, papel numa área, ou é admin.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, erro, erroBanco, rpc, usuariosMin } from '@/lib/pops/server'
import { temModuloPops, uuidValido } from '@/lib/pops/regras'
import { hojeSP } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    if (!temModuloPops(await atorDe(auth))) return erro('O painel é de quem cuida dos POPs.', 403)
    const sp = req.nextUrl.searchParams
    const area = sp.get('area')
    if (area && !uuidValido(area)) return erro('Área inválida.')
    const dias = Math.min(366, Math.max(1, Number(sp.get('dias')) || 30))
    const hoje = hojeSP()
    const de = somarDias(hoje, -(dias - 1))

    const totais = await rpc<Record<string, number>>('pops_painel_area', { p_area: area || null, p_de: de, p_ate: hoje })

    // POPs da área (de quem não é modelo do sistema), para os ids das listas.
    let qp = supabaseAdmin.from('pops').select('id, codigo, titulo, dono_id, proxima_revisao_em')
      .eq('arquivado', false).or('template_tipo.is.null,template_tipo.neq.sistema')
    if (area) qp = qp.eq('area_id', area)
    const vencidos = await qp.lt('proxima_revisao_em', hoje).order('proxima_revisao_em', { ascending: true }).limit(100)
    if (vencidos.error) return erroBanco(vencidos.error)

    // Execuções em aberto com prazo vencido (só exibição; até 100).
    let idsArea: string[] | null = null
    if (area) {
      const { data } = await supabaseAdmin.from('pops').select('id').eq('area_id', area).order('id').limit(1000)
      idsArea = (data || []).map((p) => p.id as string)
    }
    let qa = supabaseAdmin.from('pops_execucoes')
      .select('ticket_id, pop_id, data_referencia, ref_externa, tickets!inner(numero, status, prazo, responsavel_id)')
      .not('tickets.status', 'in', '(resolvido,fechado,cancelado)').lt('tickets.prazo', hoje)
      .order('data_referencia', { ascending: true }).limit(100)
    if (idsArea) qa = idsArea.length ? qa.in('pop_id', idsArea) : qa.eq('pop_id', '00000000-0000-0000-0000-000000000000')
    const atr = await qa
    if (atr.error) return erroBanco(atr.error)
    const popIds = [...new Set((atr.data || []).map((a) => a.pop_id as string))]
    const popsAtr = popIds.length ? (await supabaseAdmin.from('pops').select('id, codigo, titulo').in('id', popIds)).data || [] : []
    const atrasadas = (atr.data || []).map((a) => ({ ...a, pop: popsAtr.find((p) => p.id === a.pop_id) || null }))

    const usuarios = await usuariosMin([
      ...(vencidos.data || []).map((p) => p.dono_id as string),
      ...atrasadas.map((a) => (a.tickets as unknown as { responsavel_id: string }).responsavel_id),
    ])
    const r = totais.recorrentes || 0
    return NextResponse.json({
      periodo: { de, ate: hoje, dias },
      totais,
      pct_no_prazo: r ? Math.round(((totais.recorrentes_no_prazo || 0) / r) * 1000) / 10 : null,
      revisao_vencida: vencidos.data || [],
      atrasadas,
      usuarios,
    })
  } catch (e) {
    return erroBanco(e)
  }
}
