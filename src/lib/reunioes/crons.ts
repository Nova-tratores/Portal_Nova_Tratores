// REUNIÕES — rotinas agendadas (GitHub Actions → /api/reunioes/cron/*).
// Todas idempotentes: o corte muda a etapa (não repete), o lembrete deixa um
// evento-marcador, a geração só cria instância que ainda não existe.
// ⚠️ O cron do GitHub atrasa horas: o corte (R6) também é calculado NA LEITURA
// (etapaEfetiva) — aqui só se grava a etapa e se notifica.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { Autenticado } from '@/lib/auth/server'
import { registrarEvento, notificarTicket } from '@/lib/tickets/server'
import type { Ticket } from '@/lib/tickets/constantes'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import { diaSP } from '@/lib/trabalho/agenda-server'
import { corteFechado, proximaDataDaSerie, addDias, somaTempo, ETAPA_INFO, type Serie } from './regras'
import { carregarReuniao, blocoPendencias, criarReuniao, carregarSerie } from './server'

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}
const br = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')

/** Ator "sistema" para operações que exigem um Autenticado (criação de instância). */
function atorSistema(userId: string): Autenticado {
  return { userId, email: null, isAdmin: true, isDev: false, categoria: null, modulos: [] }
}

// ------------------------------------------------------------ corte da pauta
/**
 * Reuniões `agendada` cujo corte já passou → `pauta_fechada`. Notifica os
 * participantes (pauta + pendências) e avisa os responsáveis das ações
 * atrasadas que o status deles vai aparecer na reunião.
 */
export async function cronCortePauta(agora = new Date()) {
  const reunioes = ok(await supabaseAdmin.from('tickets').select('*')
    .eq('tipo', 'reuniao').eq('reuniao_etapa', 'agendada').not('reuniao_inicio', 'is', null)
    .lte('reuniao_inicio', new Date(agora.getTime() + 168 * 3600_000).toISOString()).limit(200)) as Ticket[]
  const resultado = { avaliadas: reunioes.length, fechadas: 0, notificados: 0, erros: [] as string[] }
  for (const t of reunioes) {
    try {
      const r = await carregarReuniao(t.id)
      if (!r) continue
      const corte = r.serie?.corte_antecedencia_horas ?? 18
      if (!corteFechado(t.reuniao_inicio!, corte, agora)) continue
      // Fecha (condicional na etapa lida: corrida com o condutor não grava em dobro).
      const { data: gravou } = await supabaseAdmin.from('tickets')
        .update({ reuniao_etapa: 'pauta_fechada', status: ETAPA_INFO.pauta_fechada.status })
        .eq('id', t.id).eq('reuniao_etapa', 'agendada').select('id')
      if (!gravou?.length) continue
      await registrarEvento(t.id, null, 'reuniao_etapa', { de: 'agendada', para: 'pauta_fechada', auto: true, motivo: 'corte da pauta' })
      resultado.fechadas++
      const pend = await blocoPendencias(r)
      const nItens = r.itens.length
      const participantes = r.presencas.map((p) => p.usuario_id)
      await notificarTicket(r.ticket, participantes, null,
        `Pauta fechada: ${r.ticket.titulo}`,
        `${br(r.ticket.prazo)} · ${nItens} ${nItens === 1 ? 'item' : 'itens'} (${somaTempo(r.itens)} min) · ${pend.atrasadas.length} pendência(s) atrasada(s), ${pend.vencendo.length} vencendo. Item novo só pelo condutor, como urgente.`)
      resultado.notificados += participantes.length
      // Quem está atrasado fica sabendo antes da reunião.
      const porResponsavel = new Map<string, string[]>()
      for (const p of pend.atrasadas) porResponsavel.set(p.responsavel_id, [...(porResponsavel.get(p.responsavel_id) || []), `#${p.numero} ${p.titulo} (${p.dias_atraso} d)`])
      for (const [uid, lista] of porResponsavel) {
        await notificarTicket(r.ticket, [uid], null,
          `Sua${lista.length > 1 ? 's' : ''} ação${lista.length > 1 ? 'ões' : ''} atrasada${lista.length > 1 ? 's' : ''} ${lista.length > 1 ? 'entram' : 'entra'} na reunião ${br(r.ticket.prazo)}`,
          lista.join(' · ').slice(0, 300))
        resultado.notificados++
      }
    } catch (e) { resultado.erros.push(`${t.numero}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return resultado
}

// ------------------------------------------------------------ lembrete da ata
/** R11: reunião em andamento/rascunho há mais de 24 h → lembra secretário e condutor (uma vez). */
export async function cronLembreteAta(agora = new Date()) {
  const limite = new Date(agora.getTime() - 24 * 3600_000).toISOString()
  const reunioes = ok(await supabaseAdmin.from('tickets').select('*')
    .eq('tipo', 'reuniao').in('reuniao_etapa', ['em_andamento', 'ata_rascunho'])
    .lt('reuniao_inicio', limite).limit(200)) as Ticket[]
  const resultado = { avaliadas: reunioes.length, lembradas: 0, erros: [] as string[] }
  for (const t of reunioes) {
    try {
      const { data: ja } = await supabaseAdmin.from('tickets_eventos').select('id')
        .eq('ticket_id', t.id).eq('tipo', 'edicao').eq('payload->>campo', 'lembrete_ata').limit(1)
      if (ja?.length) continue
      const r = await carregarReuniao(t.id)
      if (!r) continue
      const alvo = [...new Set([r.presencas.find((p) => p.papel === 'secretario')?.usuario_id, r.presencas.find((p) => p.papel === 'condutor')?.usuario_id, r.ticket.solicitante_id].filter((x): x is string => !!x))]
      await notificarTicket(r.ticket, alvo, null,
        `Ata pendente: ${r.ticket.titulo}`,
        `A reunião começou ${br(r.ticket.prazo)} e a ata ainda não foi publicada (prazo: 24 h). Feche o rascunho e publique.`)
      await registrarEvento(t.id, null, 'edicao', { campo: 'lembrete_ata', auto: true, para: alvo })
      resultado.lembradas++
    } catch (e) { resultado.erros.push(`${t.numero}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return resultado
}

// -------------------------------------------------------- gerar instâncias
/**
 * Séries ativas e recorrentes: garante as instâncias até `diasAFrente` dias
 * (padrão 14). O rodízio do secretário anda por `instancias_geradas`.
 */
export async function cronGerarInstancias(diasAFrente = 14, agora = new Date()) {
  const series = ok(await supabaseAdmin.from('reunioes_series').select('*').eq('ativa', true).neq('recorrencia', 'nenhuma')) as Serie[]
  const hoje = hojeSP()
  const teto = addDias(hoje, diasAFrente)
  const resultado = { series: series.length, criadas: [] as string[], erros: [] as string[] }
  for (const s0 of series) {
    try {
      if (!s0.hora || s0.dia_semana == null) continue
      const hora = s0.hora.slice(0, 5)
      let serie = s0
      // Última instância (qualquer etapa menos cancelada) para encadear o passo.
      const ult = ok(await supabaseAdmin.from('tickets').select('prazo, reuniao_inicio').eq('tipo', 'reuniao').eq('reuniao_serie_id', serie.id)
        .neq('reuniao_etapa', 'cancelada').order('reuniao_inicio', { ascending: false }).limit(1)) as { prazo: string | null; reuniao_inicio: string | null }[]
      let ultimaData = ult[0]?.prazo || (ult[0]?.reuniao_inicio ? diaSP(ult[0].reuniao_inicio) : null)
      let dia = proximaDataDaSerie(serie, ultimaData && ultimaData > hoje ? ultimaData : hoje, ultimaData)
      let guarda = 0
      while (dia && dia <= teto && guarda++ < 8) {
        const existe = ok(await supabaseAdmin.from('tickets').select('id').eq('tipo', 'reuniao').eq('reuniao_serie_id', serie.id).eq('prazo', dia).neq('reuniao_etapa', 'cancelada').limit(1)) as { id: string }[]
        if (!existe.length) {
          const r = await criarReuniao(atorSistema(serie.condutor_id), { serie, dia, hora })
          resultado.criadas.push(`${serie.nome} ${dia} (#${r.ticket.numero})`)
          serie = (await carregarSerie(serie.id)) || serie
        }
        ultimaData = dia
        dia = proximaDataDaSerie(serie, dia, dia)
      }
    } catch (e) { resultado.erros.push(`${s0.nome}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  void agora
  return resultado
}
