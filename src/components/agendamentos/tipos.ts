// Tipos e rótulos da tela /agendamentos (lado do navegador).
import type { Agendamento } from '@/lib/agendador/regras'
import type { EstadoPorta } from '@/lib/omie/porta'

export interface Rodada {
  id: number
  job: string
  iniciado_em: string
  finalizado_em: string | null
  duracao_ms: number | null
  status: string
  detalhe: string | null
  disparado_por?: string | null
  quem?: string | null
  progresso?: Record<string, string> | null
}

export interface AgendamentoPainel extends Agendamento {
  quando: string
  tarefaExiste: boolean
  ultima: Rodada | null
  proxima: string | null
  rodandoAgora: { chave: string; desde: string; disparadoPor: string; quem: string | null } | null
}

export interface Painel {
  migracaoFaltando: boolean
  mensagem?: string
  podeAlterar: boolean
  motor: { ligado: boolean; bootEm: string; ultimoTick: string | null; ultimoErroTick: string | null; rodando: { chave: string; desde: string; disparadoPor: string; quem: string | null }[] }
  porta: EstadoPorta
  batida: { batida_em: string; iniciado_em: string; versao: string | null } | null
  agendamentos: AgendamentoPainel[]
  hoje: Rodada[]
}

export const STATUS: Record<string, { rotulo: string; cor: string; bg: string; borda: string }> = {
  ok: { rotulo: 'ok', cor: '#047857', bg: '#ecfdf5', borda: '#a7f3d0' },
  erro: { rotulo: 'falhou', cor: '#b91c1c', bg: '#fef2f2', borda: '#fecaca' },
  rodando: { rotulo: 'rodando', cor: '#1d4ed8', bg: '#eff6ff', borda: '#bfdbfe' },
  interrompida: { rotulo: 'interrompida', cor: '#9a3412', bg: '#fff7ed', borda: '#fed7aa' },
  bloqueio: { rotulo: 'Omie bloqueada', cor: '#92400e', bg: '#fffbeb', borda: '#fde68a' },
  aguardando_omie: { rotulo: 'aguardando a Omie', cor: '#92400e', bg: '#fffbeb', borda: '#fde68a' },
  pulado: { rotulo: 'nada a fazer', cor: '#6b7280', bg: '#f9fafb', borda: '#e5e7eb' },
}

export const statusInfo = (s: string | null | undefined) =>
  STATUS[s || ''] ?? { rotulo: s || '—', cor: '#6b7280', bg: '#f9fafb', borda: '#e5e7eb' }

export const ORIGEM: Record<string, string> = {
  agendador: 'agendador',
  botao: 'botão',
  marcado: 'marcado',
  github: 'GitHub',
}

export function quemDisparou(r: Pick<Rodada, 'disparado_por' | 'quem'>): string {
  const o = r.disparado_por ? ORIGEM[r.disparado_por] ?? r.disparado_por : 'GitHub ou rota'
  return r.quem ? `${o} · ${r.quem}` : o
}

export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms)) return ''
  const futuro = ms < 0
  const min = Math.floor(Math.abs(ms) / 60000)
  let t: string
  if (min < 1) t = futuro ? 'em instantes' : 'agora'
  else if (min < 60) t = `${min} min`
  else if (min < 24 * 60) t = `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
  else t = `${Math.floor(min / 1440)} d`
  if (min < 1) return t
  return futuro ? `em ${t}` : `há ${t}`
}

export function horaSP(iso: string | null | undefined, comDia = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    ...(comDia ? { day: '2-digit', month: '2-digit' } : {}),
  })
}

export function duracao(ms: number | null | undefined): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min${s % 60 ? ` ${s % 60} s` : ''}` : `${Math.floor(m / 60)} h ${m % 60} min`
}
