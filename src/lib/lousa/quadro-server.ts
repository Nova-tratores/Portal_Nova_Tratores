// QUADRO DA LOUSA — gravação (SERVIDOR, service role). Regras puras em ./quadro.ts.
// O quadro é a mesma OS do POS: mudou na Lousa, muda na OS (Previsao_Execucao, Dias_Execucao,
// Os_Tecnico/Os_Tecnico2, agenda_tecnico) e fica no histórico da OS (logs_ppo).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { TBL_OS, TBL_LOGS_PPO, TBL_LOUSA } from '@/lib/pos/constants'
import { deslocarDiasExecucao, primeiroDia, difDias, trocarTecnico, lerSolicitacao, trocarSolicitacao, novoValorTotal, numeroOS } from './quadro'

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

// ------------------------------------------------------------------ ficha da OS (clique no cartão)
export interface FichaOS {
  id: string; cliente: string | null; documento: string | null; cidade: string | null; endereco: string | null
  tecnico1: string | null; tecnico2: string | null; status: string | null; tipoServico: string | null; revisao: string | null
  projeto: string | null; solicitacao: string | null; observacoes: string | null; previsao: string | null; dias: string | null
  horaInicio: string | null; oficina: boolean; valorTotal: string | null; horas: string | null; km: string | null
  faturada: boolean; pendente: boolean | null
  /** só a linha "Solicitação do cliente" (o resto do Serv_Solicitado fica intacto) */
  pedido: string; valorHora: number; valorKm: number; ordemOmie: string | null
}

export async function lerFicha(id: string): Promise<FichaOS> {
  const { data, error } = await supabaseAdmin.from(TBL_OS).select('*').eq('Id_Ordem', id).limit(1)
  if (error) throw new ErroQuadro(error.message, 500)
  const o = data?.[0] as Record<string, unknown> | undefined
  if (!o) throw new ErroQuadro('OS não encontrada.', 404)
  const s = (k: string) => (o[k] == null || o[k] === '' ? null : String(o[k]))
  return {
    id, cliente: s('Os_Cliente'), documento: s('Cnpj_Cliente'), cidade: s('Cidade_Cliente'), endereco: s('Endereco_Cliente'),
    tecnico1: s('Os_Tecnico'), tecnico2: s('Os_Tecnico2'), status: s('Status'), tipoServico: s('Tipo_Servico'), revisao: s('Revisao'),
    projeto: s('Projeto'), solicitacao: s('Serv_Solicitado'), observacoes: s('Observacoes'),
    previsao: s('Previsao_Execucao') ? String(o.Previsao_Execucao).slice(0, 10) : null, dias: s('Dias_Execucao'),
    horaInicio: s('Hora_Inicio_Exec'), oficina: !!o.Servico_Oficina, valorTotal: s('Valor_Total'), horas: s('Qtd_HR'), km: s('Qtd_KM'),
    faturada: !!o.faturado_omie_em, pendente: 'lousa_pendente' in o ? !!o.lousa_pendente : null,
    pedido: lerSolicitacao(s('Serv_Solicitado')), valorHora: numeroOS(o.Valor_HR), valorKm: numeroOS(o.Valor_KM), ordemOmie: s('Ordem_Omie'),
  }
}

/** valor da hora/km quando a OS não tem o seu (o mesmo padrão do POS) */
async function valoresPadrao(): Promise<{ hora: number; km: number }> {
  const { data } = await supabaseAdmin.from('configuracoes_pos').select('valor_hora, valor_km').limit(1)
  const c = (data?.[0] || {}) as { valor_hora?: number; valor_km?: number }
  return { hora: Number(c.valor_hora) || 0, km: Number(c.valor_km) || 0 }
}

/**
 * Edição pela ficha da Lousa: dia de execução (OS de vários dias anda junto), técnicos,
 * observações e pendente. Grava na OS (o POS já vê) e no histórico. OS concluída/faturada
 * só aceita observações.
 */
export async function editarOS(id: string, c: { dia?: string | null; tecnico1?: string | null; tecnico2?: string | null; observacoes?: string | null; pendente?: boolean
  projeto?: string | null; pedido?: string | null; horas?: number | null; km?: number | null
  /** hora de início combinada (HH:MM) — a mesma do POS; ordena as OS do mesmo dia */
  hora?: string | null }, quem: string) {
  const ficha = await lerFicha(id)
  const travada = ficha.faturada || /conclu|cancel/i.test(ficha.status || '')
  const mudou: Record<string, unknown> = {}
  const partes: string[] = []
  if (c.observacoes !== undefined && (c.observacoes || '') !== (ficha.observacoes || '')) { mudou.Observacoes = c.observacoes || null; partes.push('observações') }
  const querOutro = c.dia !== undefined || c.tecnico1 !== undefined || c.tecnico2 !== undefined || c.pendente !== undefined
    || c.projeto !== undefined || c.pedido !== undefined || c.horas !== undefined || c.km !== undefined || c.hora !== undefined
  if (querOutro && travada) {
    if (!Object.keys(mudou).length) throw new ErroQuadro(`A ${id} está ${ficha.faturada ? 'faturada' : ficha.status} — só as observações mudam pela Lousa.`, 409)
  } else {
    const lista = String(ficha.dias || '').trim()
    const atual = primeiroDia(lista) || ficha.previsao
    if (c.dia && c.dia !== atual) {
      if (lista && atual) { const nova = deslocarDiasExecucao(lista, difDias(atual, c.dia)); mudou.Dias_Execucao = nova; mudou.Previsao_Execucao = primeiroDia(nova) }
      else mudou.Previsao_Execucao = c.dia
      partes.push(`dia de execução ${atual ? ddmm(atual) : '—'} → ${ddmm(c.dia)}`)
    }
    if (c.tecnico1 !== undefined && (c.tecnico1 || null) !== ficha.tecnico1) mudou.Os_Tecnico = c.tecnico1 || null
    if (c.tecnico2 !== undefined && (c.tecnico2 || null) !== ficha.tecnico2) mudou.Os_Tecnico2 = c.tecnico2 || null
    if ('Os_Tecnico' in mudou || 'Os_Tecnico2' in mudou) {
      const antes = [ficha.tecnico1, ficha.tecnico2].filter(Boolean).join(' + ') || '—'
      const depois = [('Os_Tecnico' in mudou ? mudou.Os_Tecnico : ficha.tecnico1), ('Os_Tecnico2' in mudou ? mudou.Os_Tecnico2 : ficha.tecnico2)].filter(Boolean).join(' + ') || '—'
      partes.push(`técnico ${antes} → ${depois}`)
    }
    if (c.pendente !== undefined && ficha.pendente !== null && c.pendente !== ficha.pendente) {
      mudou.lousa_pendente = c.pendente; mudou.lousa_pendente_em = c.pendente ? new Date().toISOString() : null; mudou.lousa_pendente_por = c.pendente ? quem : null
      partes.push(c.pendente ? 'ficou PENDENTE (a data continua)' : 'saiu das pendentes')
    }
    if (c.pendente !== undefined && ficha.pendente === null) throw new ErroQuadro('Para usar as pendentes, rode sql/lousa-pendente.sql no SQL Editor do Supabase.', 503)
    if (c.hora !== undefined && (c.hora || null) !== (ficha.horaInicio ? ficha.horaInicio.slice(0, 5) : null)) {
      mudou.Hora_Inicio_Exec = c.hora || null
      // fim = início + horas da OS (o POS calcula igual)
      const hrs = numeroOS(c.horas ?? ficha.horas)
      if (c.hora && hrs > 0) { const [h, m] = c.hora.split(':').map(Number); const fim = Math.min(23 * 60 + 59, h * 60 + m + Math.round(hrs * 60)); mudou.Hora_Fim_Exec = `${String(Math.floor(fim / 60)).padStart(2, '0')}:${String(fim % 60).padStart(2, '0')}` }
      partes.push(`horário ${ficha.horaInicio ? ficha.horaInicio.slice(0, 5) : '—'} → ${c.hora || '—'}`)
    }
    if (c.projeto !== undefined && (c.projeto || '').trim() !== (ficha.projeto || '')) { mudou.Projeto = (c.projeto || '').trim() || null; partes.push('projeto') }
    if (c.pedido !== undefined && (c.pedido || '').trim() !== ficha.pedido) { mudou.Serv_Solicitado = trocarSolicitacao(ficha.solicitacao, c.pedido || ''); partes.push('solicitação do cliente') }
    const hrAntes = numeroOS(ficha.horas), kmAntes = numeroOS(ficha.km)
    const hrDepois = c.horas == null ? hrAntes : Math.max(0, c.horas), kmDepois = c.km == null ? kmAntes : Math.max(0, c.km)
    if (hrDepois !== hrAntes || kmDepois !== kmAntes) {
      const pad = (!ficha.valorHora || !ficha.valorKm) ? await valoresPadrao() : { hora: 0, km: 0 }
      const vh = ficha.valorHora || pad.hora, vk = ficha.valorKm || pad.km
      mudou.Qtd_HR = String(hrDepois); mudou.Qtd_KM = String(kmDepois)
      // o valor da OS anda junto (diferença × valor da hora/km da OS), como o POS faria ao salvar
      const total = novoValorTotal(ficha.valorTotal, { antes: hrAntes, depois: hrDepois, valor: vh }, { antes: kmAntes, depois: kmDepois, valor: vk })
      mudou.Valor_Total = String(total)
      if (hrDepois !== hrAntes) partes.push(`horas ${hrAntes} → ${hrDepois}`)
      if (kmDepois !== kmAntes) partes.push(`km ${kmAntes} → ${kmDepois}`)
      partes.push(`valor da OS R$ ${numeroOS(ficha.valorTotal).toFixed(2)} → R$ ${total.toFixed(2)}`)
    }
  }
  if (!Object.keys(mudou).length) return lerFicha(id)
  const r = await supabaseAdmin.from(TBL_OS).update(mudou).eq('Id_Ordem', id)
  if (r.error) throw new ErroQuadro(r.error.message, 500)
  if ('Previsao_Execucao' in mudou || 'Dias_Execucao' in mudou || 'Os_Tecnico' in mudou) {
    const lista = String((mudou.Dias_Execucao as string) ?? ficha.dias ?? '').trim()
    const prev = (mudou.Previsao_Execucao as string) ?? ficha.previsao
    await refazerAgendaTecnico(id, ('Os_Tecnico' in mudou ? (mudou.Os_Tecnico as string | null) : ficha.tecnico1), lista ? lista.split(',') : prev ? [prev] : [], ficha.cliente)
  }
  await log(id, `Lousa (ficha): ${partes.join('; ')}`, quem)
  return lerFicha(id)
}
