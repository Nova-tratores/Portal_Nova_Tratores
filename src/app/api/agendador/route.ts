// Agendador do portal — tela /agendamentos. Plano: docs/omie-fila-agendador-plano.md
// GET  /api/agendador -> painel (agendamentos, execuções de hoje, Omie agora, saúde do laço). Admin ou Dev.
// POST /api/agendador { acao, chave, ... } -> só Dev:
//   rodar | pausar {motivo} | retomar | alterar {tipo,hora,intervalo_min,dias_semana,janela_inicio,janela_fim,dia_mes}
//   | marcar {executar_em} (rodar uma vez, com a tarefa deste agendamento) | cancelar (uma vez que não rodou)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { nomeDoUsuario } from '@/lib/agro/server'
import {
  montarPainel, rodarAgora, pausar, retomar, alterarHorario, marcarUmaVez, cancelarUmaVez, ErroAcao,
} from '@/lib/agendador/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isAdmin && !auth.isDev) return NextResponse.json({ error: 'Só admin vê os agendamentos.' }, { status: 403 })
  try {
    return NextResponse.json({ ...(await montarPainel()), podeAlterar: auth.isDev })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isDev) return NextResponse.json({ error: 'Só o Dev altera agendamentos.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const acao = String(body.acao || '')
  const chave = String(body.chave || '')
  if (!chave) return NextResponse.json({ error: 'Informe o agendamento.' }, { status: 400 })
  const quem = await nomeDoUsuario(auth)
  try {
    let detalhes: Record<string, unknown> = {}
    let resposta: Record<string, unknown> = { ok: true }
    switch (acao) {
      case 'rodar': resposta = { ok: true, ...(await rodarAgora(chave, quem)) }; break
      case 'pausar': await pausar(chave, quem, String(body.motivo || '')); detalhes = { motivo: body.motivo }; break
      case 'retomar': await retomar(chave, quem); break
      case 'alterar': {
        const r = await alterarHorario(chave, quem, {
          tipo: body.tipo as never, hora: body.hora as never, intervalo_min: body.intervalo_min as never,
          dias_semana: body.dias_semana as never, janela_inicio: body.janela_inicio as never,
          janela_fim: body.janela_fim as never, dia_mes: body.dia_mes as never,
        })
        detalhes = { antes: r.antes, depois: r.depois }
        resposta = { ok: true, quando: r.quando }
        break
      }
      case 'marcar': { const r = await marcarUmaVez(chave, quem, String(body.executar_em || '')); detalhes = r; resposta = { ok: true, ...r }; break }
      case 'cancelar': await cancelarUmaVez(chave); break
      default: return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
    }
    await registrarAuditLog({ userId: auth.userId, userName: quem, sistema: 'agendamentos', acao, entidade: 'agendamento', entidadeId: chave, entidadeLabel: chave, detalhes })
    return NextResponse.json(resposta)
  } catch (e) {
    const status = e instanceof ErroAcao ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
