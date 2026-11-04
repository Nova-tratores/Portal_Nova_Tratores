// Checklists em sequência (roteiros de POPs) anexados a esta OS.
// GET   → roteiros + etapas (execução, fora da faixa) + execuções avulsas da OS + pendentes ao concluir
// POST  { roteiro_id, responsaveis: { [ordem]: user_id }, mkt_acao_id? }  anexa e libera a 1ª etapa
// PATCH { acao: 'pular', etapa_id, motivo } | { acao: 'responsavel', etapa_id, responsavel_id }
//       | { acao: 'liberar', etapa_id } (execução cancelada → nova) | { acao: 'cancelar', roteiro_os_id }
// Quem: usuário com o módulo POS (ou admin). O autor vem SEMPRE da sessão.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { erro, erroBanco, usuariosMin } from '@/lib/pops/server'
import { uuidValido } from '@/lib/pops/regras'
import { pendentesAoConcluirOS, type RoteiroOS } from '@/lib/pops/roteiros'
import {
  anexarRoteiro, cancelarRoteiro, ErroRoteiro, liberarDeNovo, osDe, pularEtapa, roteirosDaOS, trocarResponsavel,
} from '@/lib/pops/roteiros-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Checklists na OS ainda não estão ligados no banco (falta a migration sql/pops-05-roteiros.sql).'
const temPos = (a: Autenticado) => a.isAdmin || a.modulos.some((m) => m === 'pos' || m.startsWith('pos:'))

function falha(e: unknown) {
  if (e instanceof ErroRoteiro) return erro(e.message, e.status)
  const m = String((e as { message?: string })?.message || '') + String((e as { code?: string })?.code || '')
  if (/pops_os_roteiros|pops_os_etapas|pops_roteiro|os_id|PGRST205|42P01|42703/.test(m)) return erro(MSG_SQL, 503, { migracaoFaltando: true })
  return erroBanco(e)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temPos(auth)) return erro('Sem acesso ao POS.', 403)
  const { id } = await params
  try {
    const d = await roteirosDaOS(id)
    const ids = [
      ...d.roteiros.flatMap((r) => r.etapas.map((e) => e.responsavel_id)),
      ...d.avulsas.map((a) => (a.ticket as { responsavel_id?: string } | null)?.responsavel_id),
    ]
    return NextResponse.json({
      ...d,
      pendentes: pendentesAoConcluirOS(d.roteiros as unknown as RoteiroOS[]),
      usuarios: await usuariosMin(ids),
    })
  } catch (e) { return falha(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temPos(auth)) return erro('Sem acesso ao POS.', 403)
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const roteiroId = String(body.roteiro_id || '')
  if (!uuidValido(roteiroId)) return erro('Escolha o roteiro.')
  const responsaveis: Record<number, string> = {}
  for (const [k, v] of Object.entries((body.responsaveis || {}) as Record<string, unknown>)) {
    if (v && uuidValido(String(v))) responsaveis[Number(k)] = String(v)
  }
  const mkt = body.mkt_acao_id && uuidValido(String(body.mkt_acao_id)) ? String(body.mkt_acao_id) : null
  try {
    const roteiroOsId = await anexarRoteiro({ osId: id, roteiroId, responsaveis, mktAcaoId: mkt, autor: auth.userId })
    return NextResponse.json({ ok: true, id: roteiroOsId })
  } catch (e) { return falha(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temPos(auth)) return erro('Sem acesso ao POS.', 403)
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '')
  const etapa = String(body.etapa_id || '')
  try {
    if (acao === 'cancelar') {
      const r = String(body.roteiro_os_id || '')
      if (!uuidValido(r)) return erro('Roteiro inválido.')
      if ((await osDe({ roteiroOsId: r })) !== id) return erro('Roteiro não encontrado nesta OS.', 404)
      await cancelarRoteiro(r, auth.userId)
      return NextResponse.json({ ok: true })
    }
    if (!uuidValido(etapa)) return erro('Etapa inválida.')
    if ((await osDe({ etapaId: etapa })) !== id) return erro('Etapa não encontrada nesta OS.', 404)
    if (acao === 'pular') { await pularEtapa(etapa, String(body.motivo || ''), auth.userId); return NextResponse.json({ ok: true }) }
    if (acao === 'responsavel') {
      const u = String(body.responsavel_id || '')
      if (!uuidValido(u)) return erro('Escolha a pessoa.')
      await trocarResponsavel(etapa, u)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'liberar') { await liberarDeNovo(etapa, auth.userId); return NextResponse.json({ ok: true }) }
    return erro('Ação desconhecida.')
  } catch (e) { return falha(e) }
}
