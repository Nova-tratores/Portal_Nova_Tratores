// POPs — caixa "Para aprovar": revisões em aberto (ticket 'pop_revisao').
// GET /api/pops/revisoes            → as que estão comigo (sou o aprovador designado)
// GET /api/pops/revisoes?todas=1    → todas em aberto (só admin do módulo)
// Existe porque o aprovador pode não ter o módulo da Central de Trabalho.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { atorDe, erro, erroBanco, usuariosMin } from '@/lib/pops/server'
import { ehAdminPops } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const admin = ehAdminPops(await atorDe(auth))
    const todas = req.nextUrl.searchParams.get('todas') === '1'
    if (todas && !admin) return erro('Só o admin do módulo vê todas as revisões.', 403)
    let q = supabaseAdmin.from('tickets')
      .select('id, numero, titulo, descricao, solicitante_id, responsavel_id, payload, created_at')
      .eq('tipo', 'pop_revisao').not('status', 'in', '(fechado,cancelado)')
      .order('created_at', { ascending: true }).limit(200)
    if (!todas) q = q.eq('responsavel_id', auth.userId)
    const { data, error } = await q
    if (error) return erroBanco(error)
    const lista = data || []
    const popIds = [...new Set(lista.map((t) => (t.payload as { pop_id?: string }).pop_id).filter(Boolean))] as string[]
    const pops = popIds.length
      ? (await supabaseAdmin.from('pops').select('id, codigo, titulo, area_id').in('id', popIds)).data || []
      : []
    const usuarios = await usuariosMin(lista.flatMap((t) => [t.solicitante_id, t.responsavel_id]))
    return NextResponse.json({
      revisoes: lista.map((t) => {
        const p = t.payload as { pop_id?: string; versao_id?: string; numero?: number }
        return { ticket_id: t.id, numero_ticket: t.numero, changelog: t.descricao, solicitante_id: t.solicitante_id,
                 responsavel_id: t.responsavel_id, criado_em: t.created_at, pop_id: p.pop_id, versao_id: p.versao_id,
                 versao_numero: p.numero, pop: pops.find((x) => x.id === p.pop_id) || null }
      }),
      usuarios, admin,
    })
  } catch (e) {
    return erroBanco(e)
  }
}
