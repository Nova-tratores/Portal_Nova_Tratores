// ============================================================================
// POPs — ROTEIROS (PURO, client-safe). Checklists em sequência anexados a uma
// OS (sql/pops-05-roteiros.sql). Caso de origem (04/11/2026): trator levado a
// um evento → saída da loja → chegada no evento → saída do evento → chegada na
// loja. Cada etapa vira uma execução de POP comum; a próxima só é liberada
// quando a anterior termina (decisão do usuário). Concluir a OS com etapa
// pendente só AVISA, não bloqueia.
// ============================================================================
import { uuidValido } from './regras'

export type StatusEtapa = 'pendente' | 'liberada' | 'concluida' | 'pulada'
export type StatusRoteiroOS = 'ativo' | 'concluido' | 'cancelado'

export interface EtapaModelo { nome: string; pop_id: string; responsavel_padrao_id: string | null; prazo_dias: number | null }
export interface RoteiroEntrada { nome: string; descricao: string; area_id: string; etapas: EtapaModelo[] }

export interface EtapaOS {
  id: string; ordem: number; nome: string; pop_id: string; responsavel_id: string
  prazo_dias: number | null; status: StatusEtapa; ticket_id: string | null
  liberada_em: string | null; concluida_em: string | null; motivo_pulo?: string | null
}
export interface RoteiroOS { id: string; nome: string; status: StatusRoteiroOS; etapas: EtapaOS[] }

export const MAX_ETAPAS = 30
export const STATUS_ETAPA_INFO: Record<StatusEtapa, { label: string; cor: string }> = {
  pendente: { label: 'Aguardando a anterior', cor: '#6b7280' },
  liberada: { label: 'Em andamento', cor: '#d97706' },
  concluida: { label: 'Feita', cor: '#059669' },
  pulada: { label: 'Pulada', cor: '#9ca3af' },
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Normaliza o modelo vindo da tela. Etapa = nome + POP; responsável e prazo opcionais. */
export function validarRoteiro(e: unknown): { dados: RoteiroEntrada } | { erro: string } {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
  const nome = texto(o.nome, 120)
  if (nome.length < 3) return { erro: 'Dê um nome ao roteiro (mín. 3 letras).' }
  const area_id = String(o.area_id || '')
  if (!uuidValido(area_id)) return { erro: 'Escolha a área do roteiro.' }
  const lista = Array.isArray(o.etapas) ? o.etapas : []
  if (!lista.length) return { erro: 'Inclua pelo menos uma etapa.' }
  if (lista.length > MAX_ETAPAS) return { erro: `No máximo ${MAX_ETAPAS} etapas.` }
  const etapas: EtapaModelo[] = []
  for (let i = 0; i < lista.length; i++) {
    const x = (lista[i] || {}) as Record<string, unknown>
    const n = texto(x.nome, 80)
    if (n.length < 2) return { erro: `Etapa ${i + 1}: dê um nome (ex.: "Saída da loja").` }
    const pop_id = String(x.pop_id || '')
    if (!uuidValido(pop_id)) return { erro: `Etapa ${i + 1}: escolha o POP.` }
    const resp = x.responsavel_padrao_id ? String(x.responsavel_padrao_id) : null
    if (resp && !uuidValido(resp)) return { erro: `Etapa ${i + 1}: responsável inválido.` }
    let prazo: number | null = null
    if (x.prazo_dias !== undefined && x.prazo_dias !== null && x.prazo_dias !== '') {
      prazo = Number(x.prazo_dias)
      if (!Number.isInteger(prazo) || prazo < 0 || prazo > 365) return { erro: `Etapa ${i + 1}: prazo entre 0 e 365 dias.` }
    }
    etapas.push({ nome: n, pop_id, responsavel_padrao_id: resp, prazo_dias: prazo })
  }
  return { dados: { nome, descricao: texto(o.descricao, 1000), area_id, etapas } }
}

const resolvida = (s: StatusEtapa) => s === 'concluida' || s === 'pulada'

/**
 * A etapa que deve ser liberada agora: a 1ª pendente, desde que nenhuma esteja
 * em andamento e todas as anteriores estejam feitas ou puladas. null = nada a fazer.
 */
export function proximaEtapa<T extends Pick<EtapaOS, 'ordem' | 'status'>>(etapas: T[]): T | null {
  const ord = [...etapas].sort((a, b) => a.ordem - b.ordem)
  if (ord.some((e) => e.status === 'liberada')) return null
  for (const e of ord) {
    if (resolvida(e.status)) continue
    return e.status === 'pendente' ? e : null
  }
  return null
}

/** Todas feitas ou puladas → o roteiro terminou. */
export function roteiroTerminou(etapas: Pick<EtapaOS, 'status'>[]): boolean {
  return etapas.length > 0 && etapas.every((e) => resolvida(e.status))
}

/** Resumo para o bloco da OS: x de y feitas e a etapa em andamento. */
export function situacaoRoteiro(etapas: EtapaOS[]): { total: number; feitas: number; atual: EtapaOS | null; terminou: boolean } {
  const ord = [...etapas].sort((a, b) => a.ordem - b.ordem)
  return {
    total: ord.length,
    feitas: ord.filter((e) => resolvida(e.status)).length,
    atual: ord.find((e) => e.status === 'liberada') || null,
    terminou: roteiroTerminou(ord),
  }
}

/** Etapas que ainda faltam nos roteiros ativos — o aviso ao concluir a OS. */
export function pendentesAoConcluirOS(roteiros: Pick<RoteiroOS, 'nome' | 'status' | 'etapas'>[]): string[] {
  return roteiros.filter((r) => r.status === 'ativo')
    .flatMap((r) => [...r.etapas].sort((a, b) => a.ordem - b.ordem)
      .filter((e) => !resolvida(e.status)).map((e) => `${r.nome}: ${e.nome}`))
}

/** Texto do confirm() antes de concluir a OS. null = nada pendente. */
export function mensagemAvisoConclusao(pendentes: string[]): string | null {
  if (!pendentes.length) return null
  const lista = pendentes.slice(0, 8).map((p) => `• ${p}`).join('\n')
  const resto = pendentes.length > 8 ? `\n… e mais ${pendentes.length - 8}` : ''
  return `Esta OS ainda tem ${pendentes.length} checklist(s) sem fazer:\n${lista}${resto}\n\nConcluir a OS mesmo assim?`
}

/** Prazo (YYYY-MM-DD) da execução liberada hoje com N dias. null = sem prazo. */
export function prazoDaEtapa(hojeISO: string, prazoDias: number | null): string | null {
  if (prazoDias === null || prazoDias === undefined) return null
  const d = new Date(`${hojeISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + prazoDias)
  return d.toISOString().slice(0, 10)
}

/**
 * Status do ticket da execução de uma etapa em andamento:
 * resolvido/fechado → a etapa conclui e a próxima é liberada;
 * cancelado/apagado → a etapa fica parada com aviso (alguém decide: liberar de novo ou pular);
 * o resto → segue em andamento.
 */
export function etapaPeloTicket(statusTicket: string | null): 'concluir' | 'cancelada' | 'manter' {
  if (statusTicket === 'resolvido' || statusTicket === 'fechado') return 'concluir'
  if (statusTicket === 'cancelado' || statusTicket === null) return 'cancelada'
  return 'manter'
}
