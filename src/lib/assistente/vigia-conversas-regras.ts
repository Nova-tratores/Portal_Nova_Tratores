// Regras PURAS do vigia de conversas do NovaZap: quando um cliente ficou
// sem resposta e alguém do pós-vendas precisa ser avisado.
//
// "Sem resposta" = depois da ÚLTIMA mensagem do cliente não veio nenhuma
// mensagem enviada (nem do Tratorilson, nem de pessoa). A mensagem automática
// de "fora do horário" NÃO conta como resposta (ela só avisa o horário).

export interface MsgChatwoot {
  message_type: number // 0 recebida · 1 enviada · 2 atividade · 3 modelo
  created_at: number // epoch em segundos
  content?: string | null
  private?: boolean
  content_attributes?: Record<string, unknown> | null
}

export const ESPERA_MIN = 10 // minutos sem resposta até avisar
export const JANELA_HORAS = 24 // não avisa sobre mensagem mais velha que isso

// Pedaços de mensagem que só encerram a conversa ("obrigado", "ok", "até amanhã"…).
const DESPEDIDA = /^(ok+|okay|blz|beleza|show|perfeito|certo|combinado|t[aá] bom|tudo bem|tudo certo|valeu+|vlw|obrigad[oa]s?|muito obrigad[oa]|agrade[cç]o|grat[oa]|de nada|at[eé] (amanh[aã]|logo|mais|segunda)|bom dia|boa tarde|boa noite|tmj|👍|🙏|👌|😊|🙂)$/i

/** Mensagem que não pede resposta (despedida, agradecimento, só figurinha). */
export function ehDespedida(texto: string | null | undefined): boolean {
  const t = (texto || '').trim()
  if (!t) return true // só mídia/figurinha sem texto: não dá para ler
  if (/^[\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}\s]+$/u.test(t)) return true // só emoji
  if (t.length > 60) return false
  const partes = t.toLowerCase().split(/[,.!?\n]+/).map((p) => p.trim().replace(/[\s🙏👍]+$/u, '')).filter(Boolean)
  // "Ok agradeço", "beleza obrigado": cada palavra solta também vale
  const palavraOk = (w: string) => /^(ok+|okay|blz|beleza|show|perfeito|certo|combinado|valeu+|vlw|obrigad[oa]s?|agrade[cç]o|grat[oa]|muito|tmj)$/i.test(w)
  return partes.length > 0 && partes.every((p) => DESPEDIDA.test(p) || p.split(/\s+/).every(palavraOk))
}

const ehResposta = (m: MsgChatwoot) =>
  m.message_type === 1 && !m.private && !(m.content_attributes && m.content_attributes.tratorilson_fora_horario)

export interface Analise {
  precisa: boolean
  desde: number | null // epoch (s) da 1ª mensagem do cliente sem resposta
  ultima: number | null // epoch (s) da última mensagem do cliente
  textos: string[] // o que o cliente escreveu sem resposta
  motivo: 'respondida' | 'aguardando' | 'antiga' | 'despedida' | 'sem resposta'
}

export function analisarConversa(msgs: MsgChatwoot[], agoraSeg: number): Analise {
  const ord = msgs.filter((m) => m.message_type === 0 || m.message_type === 1).sort((a, b) => a.created_at - b.created_at)
  let ultimaResp = -1
  ord.forEach((m, i) => { if (ehResposta(m)) ultimaResp = i })
  const semResposta = ord.slice(ultimaResp + 1).filter((m) => m.message_type === 0 && !m.private)
  if (!semResposta.length) return { precisa: false, desde: null, ultima: null, textos: [], motivo: 'respondida' }
  const ultima = semResposta[semResposta.length - 1].created_at
  const base = { desde: semResposta[0].created_at, ultima, textos: semResposta.map((m) => (m.content || '').trim()).filter(Boolean) }
  if (agoraSeg - ultima < ESPERA_MIN * 60) return { precisa: false, ...base, motivo: 'aguardando' }
  if (agoraSeg - ultima > JANELA_HORAS * 3600) return { precisa: false, ...base, motivo: 'antiga' }
  if (semResposta.every((m) => ehDespedida(m.content))) return { precisa: false, ...base, motivo: 'despedida' }
  return { precisa: true, ...base, motivo: 'sem resposta' }
}

export interface Remetente {
  phone_number?: string | null
  identifier?: string | null
  custom_attributes?: Record<string, unknown> | null
}

/** Contato que não é cliente (funcionário, fornecedor, grupo) não gera aviso. */
export function contatoIgnorado(s: Remetente): boolean {
  const ca = s.custom_attributes || {}
  const tipo = String(ca.tipo_contato || '').toLowerCase()
  if (tipo === 'funcionario' || tipo === 'fornecedor') return true
  if (ca.funcionario || ca.fornecedor) return true
  if (!s.phone_number) return true // grupos e contatos sem telefone
  if (String(s.identifier || '').includes('@g.us')) return true
  return false
}

export function resumoAviso(textos: string[], minutos: number): string {
  const t = textos.join(' / ').replace(/\s+/g, ' ').slice(0, 350)
  const espera = minutos >= 120 ? `${Math.round(minutos / 60)} h` : `${minutos} min`
  return `Cliente sem resposta há ${espera}: "${t}"`
}
