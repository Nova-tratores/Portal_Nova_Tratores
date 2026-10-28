// POPs (Procedimento Operacional Padrão) — tipos e regras PURAS.
// CLIENT-SAFE: nada de banco aqui (o acesso fica em ./server). A tela usa as
// mesmas funções que a rota para validar — e o banco reforça as principais
// (sql/pops-01-schema.sql: pops_resposta_valida, triggers de imutabilidade).

export type TipoPasso = 'instrucao' | 'check' | 'foto' | 'numero' | 'texto' | 'selecao' | 'assinatura'
export type EstadoVersao = 'rascunho' | 'em_revisao' | 'publicado' | 'obsoleto'
export type Recorrencia = 'diario' | 'semanal' | 'mensal'

export const TIPOS_PASSO: { id: TipoPasso; label: string; resposta: boolean }[] = [
  { id: 'instrucao', label: 'Instrução', resposta: false },
  { id: 'check', label: 'Confirmação (sim/não)', resposta: true },
  { id: 'foto', label: 'Foto', resposta: true },
  { id: 'numero', label: 'Número', resposta: true },
  { id: 'texto', label: 'Texto livre', resposta: true },
  { id: 'selecao', label: 'Escolha entre opções', resposta: true },
  { id: 'assinatura', label: 'Assinatura', resposta: true },
]

export const ESTADO_INFO: Record<EstadoVersao, { label: string; cor: string }> = {
  rascunho: { label: 'Rascunho', cor: '#6b7280' },
  em_revisao: { label: 'Em revisão', cor: '#d97706' },
  publicado: { label: 'Publicado', cor: '#059669' },
  obsoleto: { label: 'Obsoleto', cor: '#9ca3af' },
}

export interface ConfigPasso {
  min_fotos?: number
  max_fotos?: number
  unidade?: string
  min?: number
  max?: number
  opcoes?: string[]
  quem?: 'executor' | 'cliente'
}

export interface PassoEntrada {
  chave?: string
  tipo: TipoPasso
  titulo: string
  ajuda?: string
  obrigatorio?: boolean
  config?: ConfigPasso
  midia_path?: string | null
}

export interface Passo extends Required<Omit<PassoEntrada, 'chave' | 'midia_path'>> {
  id: string
  versao_id: string
  ordem: number
  chave: string
  midia_path: string | null
}

export interface Resposta {
  passo_id: string
  valor: Record<string, unknown>
  fotos: string[]
  fora_faixa?: boolean
}

const LIMITE = { titulo: 300, ajuda: 1000, opcoes: 20, opcao: 80, unidade: 20, fotos: 10, passos: 60 }
const TIPOS = new Set(TIPOS_PASSO.map((t) => t.id))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const uuidValido = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
export const tipoTemResposta = (t: TipoPasso) => t !== 'instrucao'

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

// ---------------------------------------------------------------------------
// Passos (editor → rota → pops_salvar_rascunho)
// ---------------------------------------------------------------------------
export function normalizarPasso(entrada: unknown, i: number): { passo: PassoEntrada } | { erro: string } {
  const e = (entrada || {}) as Record<string, unknown>
  const n = `Passo ${i + 1}`
  const tipo = String(e.tipo || '') as TipoPasso
  if (!TIPOS.has(tipo)) return { erro: `${n}: tipo inválido.` }
  const titulo = String(e.titulo || '').trim()
  if (!titulo) return { erro: `${n}: escreva o título.` }
  if (titulo.length > LIMITE.titulo) return { erro: `${n}: título longo demais (máx. ${LIMITE.titulo}).` }
  const ajuda = String(e.ajuda || '').trim().slice(0, LIMITE.ajuda)
  const c = (e.config || {}) as Record<string, unknown>
  const config: ConfigPasso = {}

  if (tipo === 'foto') {
    const min = num(c.min_fotos) ?? 1
    const max = num(c.max_fotos) ?? Math.max(min, 5)
    if (!Number.isInteger(min) || min < 1 || min > LIMITE.fotos) return { erro: `${n}: mínimo de fotos entre 1 e ${LIMITE.fotos}.` }
    if (!Number.isInteger(max) || max < min || max > LIMITE.fotos) return { erro: `${n}: máximo de fotos entre o mínimo e ${LIMITE.fotos}.` }
    config.min_fotos = min
    config.max_fotos = max
  } else if (tipo === 'numero') {
    const min = num(c.min)
    const max = num(c.max)
    if (Number.isNaN(min) || Number.isNaN(max)) return { erro: `${n}: faixa precisa ser numérica.` }
    if (min !== undefined && max !== undefined && min > max) return { erro: `${n}: mínimo maior que o máximo.` }
    if (min !== undefined) config.min = min
    if (max !== undefined) config.max = max
    const unidade = String(c.unidade || '').trim()
    if (unidade) config.unidade = unidade.slice(0, LIMITE.unidade)
  } else if (tipo === 'selecao') {
    const opcoes = (Array.isArray(c.opcoes) ? c.opcoes : [])
      .map((o) => String(o ?? '').trim().slice(0, LIMITE.opcao)).filter(Boolean)
    const unicas = [...new Set(opcoes)]
    if (unicas.length < 2) return { erro: `${n}: informe pelo menos 2 opções diferentes.` }
    if (unicas.length > LIMITE.opcoes) return { erro: `${n}: no máximo ${LIMITE.opcoes} opções.` }
    config.opcoes = unicas
  } else if (tipo === 'assinatura') {
    config.quem = c.quem === 'cliente' ? 'cliente' : 'executor'
  }

  const midia = typeof e.midia_path === 'string' && e.midia_path.trim() ? e.midia_path.trim() : null
  return {
    passo: {
      ...(uuidValido(e.chave) ? { chave: e.chave } : {}),
      tipo, titulo, ajuda,
      // Instrução não tem resposta: "obrigatório" não se aplica.
      obrigatorio: tipo === 'instrucao' ? false : e.obrigatorio !== false,
      config,
      midia_path: midia,
    },
  }
}

export function normalizarPassos(lista: unknown): { passos: PassoEntrada[] } | { erro: string } {
  if (!Array.isArray(lista)) return { erro: 'Lista de passos inválida.' }
  if (lista.length > LIMITE.passos) return { erro: `No máximo ${LIMITE.passos} passos.` }
  const passos: PassoEntrada[] = []
  const chaves = new Set<string>()
  for (let i = 0; i < lista.length; i++) {
    const r = normalizarPasso(lista[i], i)
    if ('erro' in r) return r
    if (r.passo.chave) {
      if (chaves.has(r.passo.chave)) delete r.passo.chave // duplicado no editor: vira passo novo
      else chaves.add(r.passo.chave)
    }
    passos.push(r.passo)
  }
  return { passos }
}

// ---------------------------------------------------------------------------
// Respostas (execução → rota → pops_responder)
// ---------------------------------------------------------------------------
export function normalizarResposta(
  passo: Pick<Passo, 'tipo' | 'config' | 'titulo'>,
  valor: unknown,
  fotos: unknown,
  prefixoFotos: string,
): { valor: Record<string, unknown>; fotos: string[] } | { erro: string } {
  const v = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>
  const lista = (Array.isArray(fotos) ? fotos : []).map(String)
  if (lista.some((f) => !f.startsWith(prefixoFotos) || f.includes('..'))) return { erro: 'Foto de outra execução.' }
  if (passo.tipo !== 'foto' && lista.length) return { erro: 'Este passo não recebe foto.' }

  switch (passo.tipo) {
    case 'instrucao':
      return { erro: 'Passo de instrução não tem resposta.' }
    case 'check':
      if (typeof v.sim !== 'boolean') return { erro: 'Responda sim ou não.' }
      return { valor: { sim: v.sim }, fotos: [] }
    case 'numero': {
      const n = num(v.numero)
      if (n === undefined || Number.isNaN(n)) return { erro: 'Informe um número.' }
      return { valor: { numero: n }, fotos: [] }
    }
    case 'texto': {
      const t = String(v.texto ?? '').trim()
      if (!t) return { erro: 'Escreva a resposta.' }
      return { valor: { texto: t.slice(0, 4000) }, fotos: [] }
    }
    case 'selecao': {
      const o = String(v.opcao ?? '').trim()
      if (!(passo.config.opcoes || []).includes(o)) return { erro: 'Escolha uma das opções.' }
      return { valor: { opcao: o }, fotos: [] }
    }
    case 'assinatura': {
      const nome = String(v.nome ?? '').trim()
      if (!nome) return { erro: 'Informe o nome de quem assina.' }
      const img = typeof v.imagem_path === 'string' && v.imagem_path.startsWith(prefixoFotos) ? v.imagem_path : undefined
      return { valor: { nome: nome.slice(0, 120), quem: passo.config.quem || 'executor', ...(img ? { imagem_path: img } : {}) }, fotos: [] }
    }
    case 'foto': {
      const max = passo.config.max_fotos ?? LIMITE.fotos
      if (lista.length > max) return { erro: `No máximo ${max} foto(s) neste passo.` }
      // Salvar com menos que o mínimo é permitido (vai salvando); só não encerra.
      return { valor: {}, fotos: [...new Set(lista)] }
    }
  }
}

// Espelho de pops_resposta_valida (SQL). Fora da faixa continua válido.
export function respostaValida(passo: Pick<Passo, 'tipo' | 'config'>, r: Pick<Resposta, 'valor' | 'fotos'> | undefined): boolean {
  if (passo.tipo === 'instrucao') return true
  if (!r) return false
  const v = r.valor || {}
  switch (passo.tipo) {
    case 'check': return typeof v.sim === 'boolean'
    case 'numero': return typeof v.numero === 'number' && Number.isFinite(v.numero)
    case 'texto': return String(v.texto ?? '').trim().length > 0
    case 'selecao': return String(v.opcao ?? '').trim().length > 0
    case 'assinatura': return String(v.nome ?? '').trim().length > 0
    case 'foto': return (r.fotos || []).length >= Math.max(1, passo.config.min_fotos ?? 1)
  }
}

export function foraDaFaixa(config: ConfigPasso, numero: number): boolean {
  return (config.min !== undefined && numero < config.min) || (config.max !== undefined && numero > config.max)
}

// Passos obrigatórios ainda sem resposta válida (o que trava o encerramento).
export function pendentes(passos: Pick<Passo, 'id' | 'tipo' | 'config' | 'obrigatorio'>[], respostas: Resposta[]) {
  const porPasso = new Map(respostas.map((r) => [r.passo_id, r]))
  return passos.filter((p) => p.obrigatorio && p.tipo !== 'instrucao' && !respostaValida(p, porPasso.get(p.id)))
}

// ---------------------------------------------------------------------------
// Papéis — quem pode o quê (a rota decide com isto; o banco só guarda).
// Módulo `pops` no Admin: puro = tudo; ações admin | editar | aprovar | executar.
// Escopo por área em pops_area_papeis (dono / aprovador).
// ---------------------------------------------------------------------------
export interface Ator {
  userId: string
  isAdmin: boolean
  modulos: string[]
  papeisArea: { area_id: string; papel: 'dono' | 'aprovador' }[]
}
export interface PopRef { area_id: string; dono_id: string; template_tipo: string | null }

const tem = (a: Ator, acao: string) => a.modulos.includes('pops') || a.modulos.includes(`pops:${acao}`)
const papelNaArea = (a: Ator, area: string, papel: 'dono' | 'aprovador') =>
  a.papeisArea.some((p) => p.area_id === area && p.papel === papel)

export const ehAdminPops = (a: Ator) => a.isAdmin || tem(a, 'admin')
export const temModuloPops = (a: Ator) =>
  ehAdminPops(a) || a.modulos.some((m) => m === 'pops' || m.startsWith('pops:')) || a.papeisArea.length > 0

export function podeCriarNaArea(a: Ator, areaId: string): boolean {
  return ehAdminPops(a) || papelNaArea(a, areaId, 'dono')
}

// Editar conteúdo (rascunho, nova versão, submeter, agendar, exigir ciência).
// Modelo do sistema: só admin.
export function podeEditarPop(a: Ator, p: PopRef): boolean {
  if (ehAdminPops(a)) return true
  if (p.template_tipo === 'sistema') return false
  return p.dono_id === a.userId || papelNaArea(a, p.area_id, 'dono')
}

// Ver rascunho/em revisão (espelha pops_pode_editar do SQL — mais largo que editar).
export function podeVerRascunho(a: Ator, p: PopRef): boolean {
  return ehAdminPops(a) || p.dono_id === a.userId || a.papeisArea.some((x) => x.area_id === p.area_id)
}

export function podeAprovar(a: Ator, p: PopRef): boolean {
  if (ehAdminPops(a)) return true
  if (p.template_tipo === 'sistema') return false
  return papelNaArea(a, p.area_id, 'aprovador')
}

export function podeExecutar(a: Ator, p: PopRef): boolean {
  if (p.template_tipo === 'sistema') return false
  return ehAdminPops(a) || tem(a, 'executar') || tem(a, 'editar') || p.dono_id === a.userId
    || a.papeisArea.some((x) => x.area_id === p.area_id)
}

// ---------------------------------------------------------------------------
// Recorrência — a execução de um agendamento vence neste dia?
// Diário inclui sábado, domingo e feriado (decisão do Gate 0). Mensal com
// dia 31 (ou 29/30 em mês curto) cai no último dia do mês.
// ---------------------------------------------------------------------------
export interface AgendamentoRef {
  recorrencia: Recorrencia
  dia_semana: number | null
  dia_mes: number | null
  // Só mensal: a cada N meses, contando do mês de inicio_em (ausente/1 = todo mês).
  intervalo_meses?: number | null
  inicio_em: string
  ativo: boolean
}

export function venceEm(ag: AgendamentoRef, dataISO: string): boolean {
  if (!ag.ativo || dataISO < ag.inicio_em) return false
  const [y, m, d] = dataISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (ag.recorrencia === 'diario') return true
  if (ag.recorrencia === 'semanal') return dt.getUTCDay() === ag.dia_semana
  const n = Math.max(1, ag.intervalo_meses || 1)
  if (n > 1) {
    const [yi, mi] = ag.inicio_em.split('-').map(Number)
    if (((y - yi) * 12 + (m - mi)) % n !== 0) return false
  }
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d === Math.min(ag.dia_mes ?? 1, ultimo)
}

// Próximo dia (>= dataISO) em que a rotina vence; null se não vence em 3 anos.
export function proximaData(ag: AgendamentoRef, dataISO: string): string | null {
  const [y, m, d] = dataISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  for (let i = 0; i < 366 * 3; i++) {
    const iso = dt.toISOString().slice(0, 10)
    if (venceEm({ ...ag, ativo: true }, iso)) return iso
    dt.setUTCDate(dt.getUTCDate() + 1)
  }
  return null
}

// Opções "a cada N meses" oferecidas na tela (o banco aceita 1..24).
export const INTERVALOS_MESES = [1, 2, 3, 4, 6, 12] as const

export function validarAgendamento(e: Record<string, unknown>):
  { dados: { recorrencia: Recorrencia; dia_semana: number | null; dia_mes: number | null; responsavel_padrao_id: string; inicio_em?: string; intervalo_meses?: number } } | { erro: string } {
  const recorrencia = String(e.recorrencia || '') as Recorrencia
  if (!['diario', 'semanal', 'mensal'].includes(recorrencia)) return { erro: 'Escolha diária, semanal ou mensal.' }
  if (!uuidValido(e.responsavel_padrao_id)) return { erro: 'Escolha o responsável padrão.' }
  let dia_semana: number | null = null
  let dia_mes: number | null = null
  if (recorrencia === 'semanal') {
    dia_semana = Number(e.dia_semana)
    if (!Number.isInteger(dia_semana) || dia_semana < 0 || dia_semana > 6) return { erro: 'Escolha o dia da semana.' }
  }
  if (recorrencia === 'mensal') {
    dia_mes = Number(e.dia_mes)
    if (!Number.isInteger(dia_mes) || dia_mes < 1 || dia_mes > 31) return { erro: 'Dia do mês entre 1 e 31.' }
  }
  const inicio = typeof e.inicio_em === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.inicio_em) ? e.inicio_em : undefined
  // A cada N meses: a 1ª vez é obrigatória — é dela que saem o mês de partida e o dia.
  const intervalo = e.intervalo_meses == null || e.intervalo_meses === '' ? 1 : Number(e.intervalo_meses)
  if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 24) return { erro: 'Intervalo entre 1 e 24 meses.' }
  if (intervalo > 1 && recorrencia !== 'mensal') return { erro: 'Intervalo em meses só vale para rotina mensal.' }
  if (intervalo > 1 && !inicio) return { erro: 'Informe a data da primeira vez.' }
  return { dados: {
    recorrencia, dia_semana, dia_mes, responsavel_padrao_id: e.responsavel_padrao_id,
    ...(inicio ? { inicio_em: inicio } : {}), ...(intervalo > 1 ? { intervalo_meses: intervalo } : {}),
  } }
}

// ---------------------------------------------------------------------------
// Diff simples entre versões (pela `chave`, que atravessa as versões).
// ---------------------------------------------------------------------------
export type MudancaPasso =
  | { tipo: 'adicionado'; depois: PassoComparavel }
  | { tipo: 'removido'; antes: PassoComparavel }
  | { tipo: 'alterado'; antes: PassoComparavel; depois: PassoComparavel; campos: string[] }
  | { tipo: 'movido'; antes: PassoComparavel; depois: PassoComparavel }

export type PassoComparavel = Pick<Passo, 'chave' | 'ordem' | 'tipo' | 'titulo' | 'ajuda' | 'obrigatorio' | 'config' | 'midia_path'>

export function diffPassos(antes: PassoComparavel[], depois: PassoComparavel[]): MudancaPasso[] {
  const mapaAntes = new Map(antes.map((p) => [p.chave, p]))
  const mapaDepois = new Map(depois.map((p) => [p.chave, p]))
  const out: MudancaPasso[] = []
  for (const d of [...depois].sort((a, b) => a.ordem - b.ordem)) {
    const a = mapaAntes.get(d.chave)
    if (!a) { out.push({ tipo: 'adicionado', depois: d }); continue }
    const campos = (['tipo', 'titulo', 'ajuda', 'obrigatorio', 'config', 'midia_path'] as const)
      .filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null))
    if (campos.length) out.push({ tipo: 'alterado', antes: a, depois: d, campos })
    else if (a.ordem !== d.ordem) out.push({ tipo: 'movido', antes: a, depois: d })
  }
  for (const a of antes) if (!mapaDepois.has(a.chave)) out.push({ tipo: 'removido', antes: a })
  return out
}

// ---------------------------------------------------------------------------
// QR da folha impressa (OPL): abre a versão VIGENTE do POP (o detalhe sempre
// mostra a publicada) já com "Executar" aberto para quem pode executar.
// ---------------------------------------------------------------------------
export function urlExecutarPop(origem: string, popId: string): string {
  return `${origem.replace(/\/+$/, '')}/pops/${popId}?executar=1`
}

// Texto curto da recorrência ("Toda segunda", "Todo dia 31 (ou o último)").
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const NOME_INTERVALO: Record<number, string> = { 2: 'bimestral', 3: 'trimestral', 6: 'semestral', 12: 'anual' }
export function descreverRecorrencia(a: Pick<AgendamentoRef, 'recorrencia' | 'dia_semana' | 'dia_mes' | 'intervalo_meses'>): string {
  if (a.recorrencia === 'diario') return 'Todo dia (inclusive fim de semana e feriado)'
  if (a.recorrencia === 'semanal') {
    const d = a.dia_semana ?? 1
    return d === 0 || d === 6 ? `Todo ${DIAS[d]}` : `Toda ${DIAS[d]}-feira`
  }
  const n = a.intervalo_meses || 1
  const ultimo = (a.dia_mes ?? 1) > 28 ? ' (ou o último dia do mês)' : ''
  if (n > 1) return `A cada ${n} meses${NOME_INTERVALO[n] ? ` (${NOME_INTERVALO[n]})` : ''}, no dia ${a.dia_mes}${ultimo}`
  return `Todo dia ${a.dia_mes}${ultimo}`
}

// ---------------------------------------------------------------------------
// Etiquetas livres do POP ("limpeza", "segurança"…): minúsculas, sem "#",
// espaços colapsados, 1–30 caracteres, sem repetir, no máximo 10.
// ---------------------------------------------------------------------------
export const MAX_ETIQUETAS = 10
export function normalizarEtiquetas(lista: unknown): string[] {
  const entrada = Array.isArray(lista) ? lista : typeof lista === 'string' ? lista.split(',') : []
  const out: string[] = []
  for (const e of entrada) {
    const t = String(e ?? '').replace(/#/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 30).trim()
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= MAX_ETIQUETAS) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Execução disparada pela OS do POS: "OS do tipo X que entrar na fase Y".
// Comparação sem acento/caixa (o Tipo_Servico vem do AppSheet com grafias soltas).
// ---------------------------------------------------------------------------
const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export interface GatilhoOSRef { tipo_servico: string; fase: string; ativo: boolean }
export function gatilhoCasaComOS(g: GatilhoOSRef, os: { Tipo_Servico?: unknown; Status?: unknown }): boolean {
  return g.ativo && !!semAcento(g.tipo_servico) && semAcento(g.tipo_servico) === semAcento(os.Tipo_Servico)
    && semAcento(g.fase) === semAcento(os.Status)
}

// Chassi dentro do "Projeto" da OS ("MAHINDRA 7095 MDI09520PT0006593"): a palavra
// mais longa com 8+ letras/números que tenha letra E número (o modelo "7095" fica fora).
export function chassiDoProjeto(projeto: unknown): string | null {
  const palavras = String(projeto ?? '').toUpperCase().split(/[\s|/,;]+/)
    .map((p) => p.replace(/[^A-Z0-9-]/g, ''))
    .filter((p) => p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p))
  return palavras.sort((a, b) => b.length - a.length)[0] || null
}

// Referência da execução: "OS-0852 · MDI09520PT0006593" (até 80 caracteres —
// é por ela que a aba Execuções acha o histórico da máquina).
export function refExecucaoDaOS(idOrdem: string, projeto: unknown): string {
  const chassi = chassiDoProjeto(projeto)
  return `${idOrdem}${chassi ? ` · ${chassi}` : ''}`.slice(0, 80)
}

export function validarGatilhoOS(e: Record<string, unknown>):
  { dados: { tipo_servico: string; fase: string; responsavel_padrao_id: string } } | { erro: string } {
  const tipo = String(e.tipo_servico ?? '').trim()
  const fase = String(e.fase ?? '').trim()
  if (!tipo || tipo.length > 80) return { erro: 'Escolha o tipo de serviço da OS.' }
  if (!fase || fase.length > 80) return { erro: 'Escolha a fase da OS.' }
  if (!uuidValido(e.responsavel_padrao_id)) return { erro: 'Escolha quem executa quando o técnico da OS não usa o portal.' }
  return { dados: { tipo_servico: tipo, fase, responsavel_padrao_id: e.responsavel_padrao_id } }
}
