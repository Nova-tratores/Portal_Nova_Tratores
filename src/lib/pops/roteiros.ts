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

// ---------------------------------------------------------------------------
// Saída × Retorno: as etapas do roteiro lado a lado
// ---------------------------------------------------------------------------
// Mesmo POP em várias etapas (saída da loja, chegada no evento, saída do evento,
// chegada na loja): cada passo vira uma linha e cada etapa uma coluna. O passo é
// casado pela `chave` (atravessa versões do POP); se as etapas usam POPs diferentes,
// pelo título sem acento. O que mudou de uma coluna para a outra fica marcado.

export interface PassoComparacao { chave: string; titulo: string; tipo: string; ordem: number; config?: { unidade?: string } | null }
export interface RespostaComparacao { valor: Record<string, unknown>; fotos: string[]; fora_faixa?: boolean }
export interface ColunaComparacao {
  etapa: string
  ordem: number
  passos: PassoComparacao[]
  /** respostas pela chave do passo */
  respostas: Record<string, RespostaComparacao>
}
export interface CelulaComparacao {
  texto: string
  numero: number | null
  fotos: string[]
  /** diferença do número para a coluna anterior que tem número */
  delta: number | null
  /** mudou em relação à coluna anterior respondida */
  mudou: boolean
  /** pede atenção: check que era "sim" e virou "não", ou valor fora da faixa */
  alerta: boolean
}
export interface LinhaComparacao {
  chave: string
  titulo: string
  tipo: string
  unidade: string
  /** uma por coluna; null = o passo não existe naquela etapa */
  celulas: (CelulaComparacao | null)[]
  mudou: boolean
  alerta: boolean
}
export interface Comparacao {
  colunas: { etapa: string; ordem: number }[]
  linhas: LinhaComparacao[]
  mudancas: number
  alertas: number
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function lerResposta(tipo: string, r: RespostaComparacao | undefined): { texto: string; numero: number | null; comparavel: string | null } {
  const vazio = { texto: '', numero: null, comparavel: null }
  if (!r) return vazio
  const v = r.valor || {}
  if (tipo === 'check') {
    if (typeof v.sim !== 'boolean') return vazio
    return { texto: v.sim ? 'Sim' : 'Não', numero: null, comparavel: v.sim ? 'sim' : 'nao' }
  }
  if (tipo === 'numero') {
    const n = typeof v.numero === 'number' ? v.numero : Number(v.numero)
    if (v.numero === undefined || v.numero === null || !Number.isFinite(n)) return vazio
    return { texto: String(n).replace('.', ','), numero: n, comparavel: String(n) }
  }
  if (tipo === 'selecao' || tipo === 'texto') {
    const t = String((tipo === 'selecao' ? v.opcao : v.texto) ?? '').trim()
    return { texto: t, numero: null, comparavel: t ? semAcento(t) : null }
  }
  if (tipo === 'assinatura') {
    const nome = String(v.nome ?? '').trim()
    return { texto: nome ? `Assinado: ${nome}` : '', numero: null, comparavel: null }
  }
  if (tipo === 'foto') {
    const n = (r.fotos || []).length
    return { texto: n ? `${n} foto${n > 1 ? 's' : ''}` : '', numero: null, comparavel: null }
  }
  return vazio
}

/** Monta a tabela Saída × Retorno. Passos de instrução ficam fora (não têm resposta). */
export function compararEtapas(entrada: ColunaComparacao[]): Comparacao {
  const cols = [...entrada].sort((a, b) => a.ordem - b.ordem)
  // Identidade da linha: a chave do passo quando ela aparece em outra coluna;
  // senão tipo + título (POPs diferentes com o mesmo passo).
  const chaves = cols.map((c) => new Set(c.passos.map((p) => p.chave)))
  const idDoPasso = (ci: number, p: PassoComparacao) =>
    chaves.some((s, i) => i !== ci && s.has(p.chave)) ? `k:${p.chave}` : `t:${p.tipo}:${semAcento(p.titulo)}`
  const mapa = new Map<string, { titulo: string; tipo: string; unidade: string; porColuna: (PassoComparacao | null)[] }>()
  cols.forEach((c, ci) => {
    for (const p of [...c.passos].sort((a, b) => a.ordem - b.ordem)) {
      if (p.tipo === 'instrucao') continue
      const id = idDoPasso(ci, p)
      let l = mapa.get(id)
      if (!l) {
        l = { titulo: p.titulo, tipo: p.tipo, unidade: p.config?.unidade || '', porColuna: cols.map(() => null) }
        mapa.set(id, l)
      }
      if (!l.porColuna[ci]) l.porColuna[ci] = p
    }
  })

  let mudancas = 0
  let alertas = 0
  const linhas: LinhaComparacao[] = [...mapa.entries()].map(([id, l]) => {
    let ant: { comparavel: string | null; numero: number | null; sim: boolean | null } | null = null
    let houveAntes = false
    let mudou = false
    let alerta = false
    const celulas = l.porColuna.map((p, ci): CelulaComparacao | null => {
      if (!p) return null
      const r = cols[ci].respostas[p.chave]
      const t = lerResposta(l.tipo, r)
      const sim = l.tipo === 'check' && t.comparavel ? t.comparavel === 'sim' : null
      let celMudou = false
      let delta: number | null = null
      let celAlerta = !!r?.fora_faixa
      if (ant && t.comparavel !== null && ant.comparavel !== null && t.comparavel !== ant.comparavel) celMudou = true
      // anotação que aparece numa etapa depois (ex.: "risco no paralama") também é mudança
      if (l.tipo === 'texto' && t.comparavel !== null && houveAntes && !ant?.comparavel) celMudou = true
      houveAntes = true
      if (t.numero !== null && ant && ant.numero !== null) delta = Math.round((t.numero - ant.numero) * 100) / 100
      if (sim === false && ant?.sim === true) celAlerta = true
      if (r) ant = { comparavel: t.comparavel, numero: t.numero, sim }
      if (celMudou) mudou = true
      if (celAlerta) alerta = true
      return { texto: t.texto, numero: t.numero, fotos: r?.fotos || [], delta, mudou: celMudou, alerta: celAlerta }
    })
    if (mudou) mudancas++
    if (alerta) alertas++
    return { chave: id, titulo: l.titulo, tipo: l.tipo, unidade: l.unidade, celulas, mudou, alerta }
  })
  return { colunas: cols.map((c) => ({ etapa: c.etapa, ordem: c.ordem })), linhas, mudancas, alertas }
}
