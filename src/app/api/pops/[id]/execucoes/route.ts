// POPs — histórico de execuções de UM POP (todas as versões), para a ficha.
// GET /api/pops/:id/execucoes[?ref=<texto>]  até 300, mais recentes primeiro;
//     ref filtra pela referência da execução (OS, chassi, placa…).
// Quem pode: quem cuida do POP (dono/aprovador da área, admin do módulo).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, carregarPop, erro, erroBanco, usuariosMin } from '@/lib/pops/server'
import { podeAprovar, podeEditarPop, uuidValido } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { id } = await params
  if (!uuidValido(id)) return erro('POP não encontrado', 404)
  try {
    const pop = await carregarPop(id)
    if (!pop) return erro('POP não encontrado', 404)
    const ator = await atorDe(auth)
    if (!podeEditarPop(ator, pop) && !podeAprovar(ator, pop)) return erro('Só quem cuida do POP vê o histórico de execuções.', 403)

    const ref = (req.nextUrl.searchParams.get('ref') || '').trim().slice(0, 80)
    let q = supabaseAdmin.from('pops_execucoes')
      .select('ticket_id, versao_id, agendamento_id, data_referencia, ref_externa, criado_em')
      .eq('pop_id', id).order('criado_em', { ascending: false }).limit(300)
    if (ref) q = q.ilike('ref_externa', `%${ref.replace(/[%_]/g, '')}%`)
    const { data: exs, error } = await q
    if (error) return erroBanco(error)
    const lista = exs || []
    const tids = lista.map((e) => e.ticket_id as string)
    const vids = [...new Set(lista.map((e) => e.versao_id as string))]

    const [tickets, versoes, passos, resps] = tids.length ? await Promise.all([
      supabaseAdmin.from('tickets').select('id, numero, status, prazo, responsavel_id, created_at, resolvido_em').in('id', tids)
        .then((r) => r.data || []),
      supabaseAdmin.from('pops_versoes').select('id, numero').in('id', vids).then((r) => r.data || []),
      supabaseAdmin.from('pops_passos').select('versao_id').in('versao_id', vids).neq('tipo', 'instrucao').limit(5000)
        .then((r) => r.data || []),
      supabaseAdmin.from('pops_execucao_respostas').select('ticket_id').in('ticket_id', tids).limit(20000)
        .then((r) => r.data || []),
    ]) : [[], [], [], []]

    const tPorId = new Map(tickets.map((t) => [t.id as string, t]))
    const vPorId = new Map(versoes.map((v) => [v.id as string, v.numero as number]))
    const totalPorVersao = new Map<string, number>()
    for (const p of passos) totalPorVersao.set(p.versao_id as string, (totalPorVersao.get(p.versao_id as string) || 0) + 1)
    const respondidos = new Map<string, number>()
    for (const r of resps) respondidos.set(r.ticket_id as string, (respondidos.get(r.ticket_id as string) || 0) + 1)

    const execucoes = lista.flatMap((e) => {
      const t = tPorId.get(e.ticket_id as string)
      if (!t) return []
      return [{
        ticket_id: e.ticket_id, numero: t.numero, status: t.status, prazo: t.prazo,
        responsavel_id: t.responsavel_id, criado_em: e.criado_em, resolvido_em: t.resolvido_em,
        data_referencia: e.data_referencia, ref_externa: e.ref_externa, recorrente: !!e.agendamento_id,
        versao: vPorId.get(e.versao_id as string) ?? null,
        respondidos: respondidos.get(e.ticket_id as string) || 0,
        total: totalPorVersao.get(e.versao_id as string) || 0,
      }]
    })
    const usuarios = await usuariosMin(execucoes.map((x) => x.responsavel_id as string))
    return NextResponse.json({ execucoes, usuarios, limite: 300 })
  } catch (e) {
    return erroBanco(e)
  }
}
