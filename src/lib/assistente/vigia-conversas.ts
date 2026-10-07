// VIGIA DE CONVERSAS do NovaZap (SERVIDOR).
// A cada poucos minutos lê as conversas ABERTAS do Chatwoot e, quando um
// cliente ficou sem resposta (regras em vigia-conversas-regras.ts), abre um
// card "Precisa de atendimento" em tratorilson_solicitacoes. O alerta central
// do portal (pós-vendas) e o painel do zap mostram esses cards.
// Não escreve NADA no Chatwoot — só lê.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { baseApiConta, chatwootConfigurado, CHATWOOT_API_TOKEN } from '@/lib/chatwoot/config'
import { analisarConversa, contatoIgnorado, resumoAviso, type MsgChatwoot, type Remetente } from './vigia-conversas-regras'

interface ConversaCw {
  id: number
  status: string
  last_activity_at?: number
  meta: { sender: Remetente & { name?: string | null } }
  last_non_activity_message?: MsgChatwoot | null
}

const cw = async (path: string) => {
  const r = await fetch(baseApiConta() + path, { headers: { api_access_token: CHATWOOT_API_TOKEN }, cache: 'no-store' })
  if (!r.ok) throw new Error(`Chatwoot ${r.status} em ${path}`)
  return r.json()
}

export interface ResultadoVigia {
  pulado?: string
  conversas: number
  avisos: { conversa: number; contato: string; resumo: string }[]
}

export async function vigiarConversas(opts: { gravar?: boolean } = {}): Promise<ResultadoVigia> {
  const gravar = opts.gravar !== false
  if (!chatwootConfigurado()) return { pulado: 'NovaZap não configurado', conversas: 0, avisos: [] }
  const agora = Math.floor(Date.now() / 1000)

  // conversas abertas com atividade nas últimas 24 h (lista vem da mais recente)
  const candidatas: ConversaCw[] = []
  for (let page = 1; page <= 10; page++) {
    const j = await cw(`/conversations?status=open&assignee_type=all&page=${page}`)
    const lote: ConversaCw[] = j?.data?.payload || []
    candidatas.push(...lote)
    const maisVelha = lote[lote.length - 1]?.last_activity_at || 0
    if (lote.length < 25 || maisVelha < agora - 26 * 3600) break
  }

  // o card já existe? (aberto, ou atendido depois da última mensagem do cliente)
  const { data: existentes, error } = await supabaseAdmin.from('tratorilson_solicitacoes')
    .select('conversa_id, contato_telefone, fase, atendida_em, created_at')
    .eq('tipo', 'humano').gte('created_at', new Date((agora - 3 * 86400) * 1000).toISOString())
  if (error && gravar) return { pulado: 'tabela tratorilson_solicitacoes ausente (rode sql/tratorilson-solicitacoes.sql)', conversas: 0, avisos: [] }
  const { data: perguntas } = await supabaseAdmin.from('tratorilson_perguntas').select('contato_telefone').eq('status', 'aberta')
  const dez = (t: string | null | undefined) => String(t || '').replace(/\D/g, '').slice(-10)
  const telPergunta = new Set((perguntas || []).map((p) => dez(p.contato_telefone)).filter(Boolean))

  const avisos: ResultadoVigia['avisos'] = []
  for (const c of candidatas) {
    const s = c.meta?.sender || {}
    if (contatoIgnorado(s)) continue
    const ult = c.last_non_activity_message
    // atalho: última mensagem foi uma resposta de verdade → nem busca o histórico
    if (ult && ult.message_type === 1 && !ult.private && !(ult.content_attributes && ult.content_attributes.tratorilson_fora_horario)) continue
    if ((c.last_activity_at || 0) < agora - 25 * 3600) continue

    const j = await cw(`/conversations/${c.id}/messages`)
    const a = analisarConversa((j?.payload || []) as MsgChatwoot[], agora)
    if (!a.precisa || !a.ultima) continue

    const tel = dez(s.phone_number)
    if (tel && telPergunta.has(tel)) continue // o Tratorilson já perguntou pra equipe sobre essa conversa
    const ultimaIso = new Date(a.ultima * 1000).toISOString()
    const jaTem = (existentes || []).some((e) =>
      (e.conversa_id === c.id || (tel && dez(e.contato_telefone) === tel)) &&
      ((e.fase || 'nova') !== 'concluida' || (e.atendida_em && e.atendida_em >= ultimaIso) || e.created_at >= ultimaIso))
    if (jaTem) continue

    const minutos = Math.round((agora - (a.desde || a.ultima)) / 60)
    const resumo = resumoAviso(a.textos, minutos)
    const contato = s.name || s.phone_number || 'Contato'
    avisos.push({ conversa: c.id, contato, resumo })
    if (gravar) {
      const cliente = s.custom_attributes?.cliente ? String(s.custom_attributes.cliente) : null
      await supabaseAdmin.from('tratorilson_solicitacoes').insert({
        contato_nome: s.name || null,
        contato_telefone: s.phone_number || null,
        cliente_nome: cliente,
        tipo: 'humano',
        resumo,
        fase: 'nova',
        conversa_id: c.id,
        origem: 'vigia',
        ultima_msg_em: ultimaIso,
        memoria: 'pendente',
      })
    }
  }
  return { conversas: candidatas.length, avisos }
}
