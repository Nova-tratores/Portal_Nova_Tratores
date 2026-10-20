// QUADRO DA LOUSA — gravação (SERVIDOR, service role). Regras puras em ./quadro.ts.
// O quadro é a mesma OS do POS: mudou na Lousa, muda na OS (Previsao_Execucao, Dias_Execucao,
// Os_Tecnico/Os_Tecnico2, agenda_tecnico) e fica no histórico da OS (logs_ppo).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { TBL_OS, TBL_LOGS_PPO, TBL_LOUSA } from '@/lib/pos/constants'
import { deslocarDiasExecucao, primeiroDia, difDias, trocarTecnico } from './quadro'

export class ErroQuadro extends Error { constructor(msg: string, public status = 400) { super(msg) } }

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const colunaFaltando = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || /lousa_pendente/.test(e.message || ''))

async function log(id: string, acao: string, quem: string) {
  const agora = new Date()
  await supabaseAdmin.from(TBL_LOGS_PPO).insert({
    Id_ppo: id, Data_Acao: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(agora),
    Hora_Acao: agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }), UsuEmail: quem, acao,
    Status_Anterior: '', Status_Atual: '', Dias_Na_Fase: 0, Total_Dias_Aberto: 0,
  }).then(() => {}, () => {})
}

interface OSLinha {
  Id_Ordem: string; Status: string | null; Os_Tecnico: string | null; Os_Tecnico2: string | null; Os_Cliente: string | null
  Previsao_Execucao: string | null; Dias_Execucao: string | null; faturado_omie_em?: string | null
}

async function lerOS(id: string): Promise<OSLinha> {
  const { data, error } = await supabaseAdmin.from(TBL_OS)
    .select('Id_Ordem, Status, Os_Tecnico, Os_Tecnico2, Os_Cliente, Previsao_Execucao, Dias_Execucao, faturado_omie_em').eq('Id_Ordem', id).limit(1)
  if (error) throw new ErroQuadro(error.message, 500)
  const os = data?.[0] as OSLinha | undefined
  if (!os) throw new ErroQuadro('OS não encontrada.', 404)
  if (/conclu|cancel/i.test(os.Status || '')) throw new ErroQuadro(`A ${id} está ${os.Status} — não muda mais pela Lousa.`, 409)
  if (os.faturado_omie_em) throw new ErroQuadro(`A ${id} já foi faturada — não muda mais pela Lousa.`, 409)
  return os
}

/** refaz a agenda_tecnico da OS com os dias/técnico novos (o mesmo que o salvar da OS faz) */
async function refazerAgendaTecnico(id: string, tecnico: string | null, dias: string[], cliente: string | null) {
  const { data: antigos } = await supabaseAdmin.from('agenda_tecnico').select('endereco, hora_inicio, hora_fim').eq('id_ordem', id).limit(1)
  await supabaseAdmin.from('agenda_tecnico').delete().eq('id_ordem', id)
  if (!tecnico || !dias.length) return
  const a = (antigos?.[0] || {}) as { endereco?: string | null; hora_inicio?: string | null; hora_fim?: string | null }
  await supabaseAdmin.from('agenda_tecnico').insert(dias.map((entrada) => {
    const [dia, horas] = entrada.split(' ')
    const [hIni, hFim] = (horas || '').split('-')
    return { tecnico_nome: tecnico, id_ordem: id, data_agendada: dia, turno: 'integral', cliente, endereco: a.endereco || null, status: 'agendado', hora_inicio: hIni || a.hora_inicio || '08:00', hora_fim: hFim || a.hora_fim || '' }
  })).then(() => {}, () => {})
}

/**
 * Cartão da OS solto num dia/técnico. `origem` = dia de onde saiu (para OS de vários dias
 * o conjunto anda junto); `tecnicoDe` = nome da linha de onde saiu; `tecnicoPara` = nome da linha nova.
 * Vale também para tirar a OS das pendentes (pendente → dia).
 */
export async function moverOS(id: string, a: { origem: string | null; destino: string; tecnicoDe: string | null; tecnicoPara: string | null }, quem: string) {
  const os = await lerOS(id)
  const lista = String(os.Dias_Execucao || '').trim()
  const diaAtual = primeiroDia(lista) || (os.Previsao_Execucao ? String(os.Previsao_Execucao).slice(0, 10) : null)
  const delta = diaAtual ? difDias(a.origem || diaAtual, a.destino) : 0
  const novaLista = lista ? deslocarDiasExecucao(lista, delta) : ''
  const novaPrev = lista ? primeiroDia(novaLista) : (diaAtual ? deslocarDiasExecucao(diaAtual, delta) : a.destino)
  const [t1, t2] = a.tecnicoPara ? trocarTecnico([os.Os_Tecnico, os.Os_Tecnico2], a.tecnicoDe, a.tecnicoPara) : [os.Os_Tecnico, os.Os_Tecnico2]
  const mudou: Record<string, unknown> = { Previsao_Execucao: novaPrev }
  if (lista) mudou.Dias_Execucao = novaLista
  if (t1 !== os.Os_Tecnico) mudou.Os_Tecnico = t1
  if (t2 !== os.Os_Tecnico2) mudou.Os_Tecnico2 = t2
  let r = await supabaseAdmin.from(TBL_OS).update({ ...mudou, lousa_pendente: false, lousa_pendente_em: null, lousa_pendente_por: null }).eq('Id_Ordem', id)
  if (colunaFaltando(r.error)) r = await supabaseAdmin.from(TBL_OS).update(mudou).eq('Id_Ordem', id)
  if (r.error) throw new ErroQuadro(r.error.message, 500)
  await refazerAgendaTecnico(id, t1, novaLista ? novaLista.split(',') : novaPrev ? [novaPrev] : [], os.Os_Cliente)
  const partes: string[] = []
  if (diaAtual && novaPrev && diaAtual !== novaPrev) partes.push(`dia de execução ${ddmm(diaAtual)} → ${ddmm(novaPrev)}`)
  if (!diaAtual && novaPrev) partes.push(`dia de execução ${ddmm(novaPrev)}`)
  if (t1 !== os.Os_Tecnico || t2 !== os.Os_Tecnico2) partes.push(`técnico ${[os.Os_Tecnico, os.Os_Tecnico2].filter(Boolean).join(' + ') || '—'} → ${[t1, t2].filter(Boolean).join(' + ') || '—'}`)
  await log(id, `Lousa: ${partes.join('; ') || 'saiu das pendentes'}`, quem)
  return { previsao: novaPrev, dias: novaLista || null, tecnicos: [t1, t2] }
}

/** Cartão da OS solto embaixo da faixa vermelha: fica pendente, SEM perder a data. */
export async function marcarPendente(id: string, quem: string) {
  await lerOS(id)
  const r = await supabaseAdmin.from(TBL_OS).update({ lousa_pendente: true, lousa_pendente_em: new Date().toISOString(), lousa_pendente_por: quem }).eq('Id_Ordem', id)
  if (colunaFaltando(r.error)) throw new ErroQuadro('Para usar as pendentes, rode sql/lousa-pendente.sql no SQL Editor do Supabase.', 503)
  if (r.error) throw new ErroQuadro(r.error.message, 500)
  await log(id, 'Lousa: OS ficou PENDENTE (a data de execução continua na OS)', quem)
}

/** Lançamento da Lousa (folga, feriado, serviço avulso) arrastado para outro dia/técnico. */
export async function moverLancamento(id: string, a: { destino: string; tecnicoDe: string | null; tecnicoPara: string | null }) {
  const { data, error } = await supabaseAdmin.from(TBL_LOUSA).select('id, tecnico_nome, tecnico_acompanhante').eq('id', id).limit(1)
  if (error) throw new ErroQuadro(error.message, 500)
  const l = data?.[0] as { tecnico_nome: string | null; tecnico_acompanhante: string | null } | undefined
  if (!l) throw new ErroQuadro('Lançamento da Lousa não encontrado.', 404)
  const mudou: Record<string, unknown> = { data: a.destino }
  if (a.tecnicoPara) {
    const [t1, t2] = trocarTecnico([l.tecnico_nome, l.tecnico_acompanhante], a.tecnicoDe, a.tecnicoPara)
    mudou.tecnico_nome = t1; mudou.tecnico_acompanhante = t2
  }
  const r = await supabaseAdmin.from(TBL_LOUSA).update(mudou).eq('id', id)
  if (r.error) throw new ErroQuadro(r.error.message, 500)
}
