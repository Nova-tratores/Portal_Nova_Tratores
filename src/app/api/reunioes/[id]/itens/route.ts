// REUNIÕES — itens da pauta.
// POST /api/reunioes/:id/itens { acao:'incluir'|'editar'|'reordenar'|'remover', ... }
//   incluir   { pergunta, tipo, trazido_por?, tempo_min?, notas?, urgente? }
//   editar    { item_id, pergunta?, tipo?, trazido_por?, tempo_min?, notas? }
//   reordenar { ordem: uuid[] }
//   remover   { item_id }
// R6: depois do corte (ou com a pauta fechada) só o condutor inclui, e o item
// nasce marcado como urgente. Depois da ata publicada nada muda (R10).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets, registrarEvento } from '@/lib/tickets/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { validarItem, novaOrdem, podeConduzir, ETAPAS_ENCERRADAS, type ReuniaoEtapa } from '@/lib/reunioes/regras'
import { carregarReuniao, podeVerReuniao, ehParticipanteDaReuniao, condutorDe, uuidValido, migrationFaltou, MSG_MIGRATION_REUNIOES } from '@/lib/reunioes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao || '')
  try {
    const r = await carregarReuniao(id)
    if (!r || !(await podeVerReuniao(r, auth))) return erro('Reunião não encontrada', 404)
    const etapa = r.ticket.reuniao_etapa as ReuniaoEtapa
    if (ETAPAS_ENCERRADAS.includes(etapa) || etapa === 'ata_rascunho') return erro('A pauta desta reunião não muda mais — a ata está sendo fechada ou já foi publicada.', 409)
    const conduz = podeConduzir(r.presencas, auth.userId, auth.isAdmin)
    const souCondutor = condutorDe(r) === auth.userId || auth.isAdmin
    if (!conduz && !ehParticipanteDaReuniao(r, auth.userId)) return erro('Só quem participa da reunião mexe na pauta.', 403)
    const corteFechado = r.etapaEfetiva !== 'agendada'   // pauta_fechada (lida ou gravada) ou em_andamento

    if (acao === 'incluir') {
      const v = validarItem(body, true)
      if (!v.ok) return erro(v.erro)
      let urgente = false
      if (corteFechado) {
        if (!souCondutor) return erro('A pauta já fechou (corte). Depois do corte só o condutor inclui item, como urgente.', 409)
        urgente = true
      }
      const trazidoPor = v.campos.trazido_por || auth.userId
      const { data: maxRow } = await supabaseAdmin.from('reunioes_itens').select('ordem').eq('reuniao_id', id).order('ordem', { ascending: false }).limit(1)
      const { data: item, error } = await supabaseAdmin.from('reunioes_itens').insert({
        reuniao_id: id, ordem: (maxRow?.[0]?.ordem ?? -1) + 1, pergunta: v.campos.pergunta, tipo: v.campos.tipo,
        trazido_por: trazidoPor, tempo_min: v.campos.tempo_min, notas: v.campos.notas ?? null, urgente,
        origem: etapa === 'em_andamento' && body.parking === true ? 'parking' : 'manual', criado_por: auth.userId,
      }).select('*').single()
      if (error || !item) return erro(error?.message || 'Falha ao incluir', 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'pauta', incluido: item.id, pergunta: v.campos.pergunta, urgente })
      return NextResponse.json({ item })
    }

    if (acao === 'editar') {
      if (!uuidValido(body.item_id)) return erro('item_id inválido')
      const item = r.itens.find((i) => i.id === body.item_id)
      if (!item) return erro('Item não encontrado', 404)
      if (!conduz && item.trazido_por !== auth.userId && item.criado_por !== auth.userId) return erro('Só quem trouxe o item (ou quem conduz) edita.', 403)
      if (item.resultado) return erro('Item já tem resultado — não se edita a pergunta depois de respondida.', 409)
      const v = validarItem(body, false)
      if (!v.ok) return erro(v.erro)
      if (!Object.keys(v.campos).length) return erro('Nada para alterar')
      const { error } = await supabaseAdmin.from('reunioes_itens').update({ ...v.campos, atualizado_em: new Date().toISOString() }).eq('id', item.id)
      if (error) return erro(error.message, 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'pauta', editado: item.id, mudancas: v.campos })
      return NextResponse.json({ ok: true })
    }

    if (acao === 'reordenar') {
      if (!conduz) return erro('Só quem conduz reordena a pauta.', 403)
      const ids = Array.isArray(body.ordem) ? (body.ordem as unknown[]).filter(uuidValido) : []
      const mapa = novaOrdem(ids, r.itens)
      for (const [itemId, ordem] of Object.entries(mapa)) {
        await supabaseAdmin.from('reunioes_itens').update({ ordem }).eq('id', itemId).eq('reuniao_id', id)
      }
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'pauta', reordenado: true })
      return NextResponse.json({ ok: true, ordem: mapa })
    }

    if (acao === 'remover') {
      if (!uuidValido(body.item_id)) return erro('item_id inválido')
      const item = r.itens.find((i) => i.id === body.item_id)
      if (!item) return erro('Item não encontrado', 404)
      if (!conduz && item.trazido_por !== auth.userId && item.criado_por !== auth.userId) return erro('Só quem trouxe o item (ou quem conduz) remove.', 403)
      if (item.resultado) return erro('Item já respondido não sai da pauta.', 409)
      const { error } = await supabaseAdmin.from('reunioes_itens').delete().eq('id', item.id)
      if (error) return erro(error.message, 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'pauta', removido: item.id, pergunta: item.pergunta })
      return NextResponse.json({ ok: true })
    }

    return erro('Ação inválida')
  } catch (e) {
    if (migrationFaltou(e)) return erro(MSG_MIGRATION_REUNIOES, 503)
    console.error('[reunioes/id/itens] POST', e)
    return erro('Falha na pauta', 500)
  }
}
