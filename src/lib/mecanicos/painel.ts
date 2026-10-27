// Painel do pós-vendas por técnico (José, 16/10/2026) — regras PURAS (testadas).
//
// Decisões do José:
//  - Horas TRABALHADAS = relatório do app do técnico (dias com início/fim). Cada técnico
//    do relatório (TecResp1 e TecResp2) fica com as horas que registrou.
//  - Horas FATURADAS = horas cobradas nas OS faturadas no período (pela data do faturamento).
//    OS com 2 técnicos: horas cobradas repartidas pelo que cada um registrou na OS
//    (sem registro, meio a meio); VALOR e KM divididos igualmente.
//  - Horas INTERNAS = horas do relatório em OS interna.
//  - Meta = 8 h por dia útil (SEGUNDA a SEXTA) → 40 h na semana; sábado/domingo = extra.
//  - OCIOSAS = meta − (faturadas + internas), nunca negativo.
//  - Valor gerado = serviço (horas) + km + peças (PPV) + outros; CUSTO de terceiros =
//    requisições da OS; LÍQUIDO = bruto − custo. OS interna não gera faturamento.

export const SEM_TECNICO = 'Sem técnico'
/**
 * Pessoas que aparecem em OS mas NÃO são técnicos de campo (José, 16/10/2026): tudo delas (OS,
 * horas, gastos, salário) vai para um GRUPO — sem meta de horas e sem hora ociosa.
 *  - Vinicius Correa → "Garantia" (as OS dele são sempre de garantia)
 *  - José Ortiz      → "Outros"
 */
// A linha do garantista leva o NOME dele (José, 21/10/2026: "troca o nome dele") — antes era "Garantia".
// Continua fora do pódio e sem meta de horas (GRUPOS / SEM_META).
export const GRUPO_GARANTIA = 'Vinicius Correa'
export const GRUPO_OUTROS = 'Outros'
export const GRUPOS: Record<string, string> = { 'Vinicius Correa': GRUPO_GARANTIA, 'José Ortiz': GRUPO_OUTROS }
export const grupoDe = (nome: string) => GRUPOS[nome] || nome
/** Pessoas do RH que NÃO são mais do pós-vendas: o salário sai da conta (as OS antigas continuam).
 *  José Ortiz — José, 21/10/2026: "ele não é mais do pós-vendas, remove ele". */
export const FORA_DA_EQUIPE = new Set(['José Ortiz'])
export const daEquipe = <T extends { pessoa: string }>(eq: T[] | undefined) => (eq || []).filter((e) => !FORA_DA_EQUIPE.has(e.pessoa))
/** linhas que não têm meta de horas (não são técnicos de campo) */
export const SEM_META = new Set([SEM_TECNICO, GRUPO_GARANTIA, GRUPO_OUTROS])
export const HORAS_DIA = 8

export interface DiaRegistrado { os: string; data: string; tecnico: string; horas: number; interna: boolean }

export interface OSFaturada {
  os: string                 // Id_Ordem do portal (ou "OMIE <nº>" quando só existe no Omie)
  numeroOmie: string | null
  cliente: string
  data: string               // YYYY-MM-DD do faturamento
  em: string | null          // ISO completo quando se sabe a hora (faturado pelo portal)
  tecnicos: string[]         // nomes já padronizados
  horasCobradas: number
  km: number
  servico: number            // R$ das horas
  kmValor: number            // R$ do km
  pecas: number              // R$ das peças (PPV)
  outros: number             // requisições repassadas, extras, desconto geral
  bruto: number
  custo: number              // custo de terceiros (ehCustoTerceiro)
  custoPorTipo?: Record<string, number>
  requisicoes?: ReqCusto[]   // as requisições que formam o custo (abrem no modal)
  /** OS de garantia (Tipo_Servico "Garantia…"): quem paga é a montadora; o técnico é quem fez */
  garantia?: boolean
  /** saiu com NFS-e (os_nfse); false = faturada com recibo. É a régua do Dashboard de Vendas. */
  nota?: boolean
  /** descontos dados na OS (R$): hora, km, desconto geral e peças (desconto do PPV) */
  descontos?: Descontos
  /** motivo do desconto escrito na OS (Omie_Espelho.descontoMotivo) — a ficha mostra para decidir a comissão */
  descontoMotivo?: string | null
  /** técnicos como estão no OMIE ("vendedor" da OS) — a comissão sai por eles; pode diferir do portal */
  tecnicosOmie?: string[]
}

export interface Descontos { hora: number; km: number; geral: number; pecas: number }

/** OS INTERNA fechada (Nº do contrato interno, cortesia, tipo de serviço interno…): o valor que a
 *  oficina deixou de cobrar. Não entra no resultado (as horas já estão no salário) — é para ficar de olho. */
export interface InternaFechada {
  os: string; numeroOmie: string | null; cliente: string; contrato: string; motivo: string
  data: string; valor: number; horas: number; tecnicos: string[]
  /** R$ das horas (base da comissão); só na leitura ao vivo, não fica na tabela */
  valorHoras?: number
  /** técnicos como estão no OMIE (comissão) */
  tecnicosOmie?: string[]
}

/** Requisição que entra no custo de terceiros da OS. */
export interface ReqCusto { id: number; tipo: string; valor: number; status: string; titulo: string; fornecedor: string; data: string; solicitante: string; nota: string | null }

const valorNum = (v: unknown) => {
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : 0
}

/**
 * CUSTO DE TERCEIROS (José, 16/10/2026): requisição que o técnico pediu como "Trator-Cliente"
 * e que NÃO foi cobrada do cliente. Alimentação e abastecimento não entram (são gastos do
 * pós-vendas); lixeira/cancelada não conta.
 */
export function ehCustoTerceiro(r: { setor?: unknown; tipo?: unknown; status?: unknown; valor_cobrado_cliente?: unknown }): boolean {
  if (!/trator-cliente/i.test(String(r.setor ?? ''))) return false
  if (/aliment|abastec/i.test(String(r.tipo ?? ''))) return false
  if (/lixeira|cancel/i.test(String(r.status ?? ''))) return false
  return !(valorNum(r.valor_cobrado_cliente) > 0)
}

export interface LinhaTecnico {
  tecnico: string
  trabalhadas: number   // seg–sex, relatório
  cliente: number       // trabalhadas em OS de cliente
  internas: number      // trabalhadas em OS interna
  extras: number        // sábado/domingo
  faturadas: number     // horas cobradas nas OS faturadas
  /** horas do app em OS já preenchida e ainda não faturada — contam na meta (José, 17/10/2026) */
  aguardando: number
  ociosas: number
  meta: number
  km: number
  servico: number; kmValor: number; pecas: number; outros: number
  bruto: number; custo: number; liquido: number
  os: number            // OS faturadas (fração quando dividida)
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** 0 = domingo … 6 = sábado, para 'YYYY-MM-DD' (meio-dia UTC: sem efeito de fuso). */
export function diaSemana(dia: string): number { return new Date(`${dia}T12:00:00Z`).getUTCDay() }
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
/** Segunda-feira da semana do dia. */
export function segundaDa(dia: string): string { const w = diaSemana(dia); return somarDias(dia, w === 0 ? -6 : 1 - w) }
export function diasUteis(de: string, ate: string): number {
  let n = 0
  for (let d = de; d <= ate; d = somarDias(d, 1)) { const w = diaSemana(d); if (w >= 1 && w <= 5) n++ }
  return n
}

function linhaVazia(tecnico: string, meta: number): LinhaTecnico {
  return { tecnico, trabalhadas: 0, cliente: 0, internas: 0, extras: 0, faturadas: 0, aguardando: 0, ociosas: 0, meta, km: 0, servico: 0, kmValor: 0, pecas: 0, outros: 0, bruto: 0, custo: 0, liquido: 0, os: 0 }
}

/**
 * Agrega o período [de, ate] por técnico. `tecnicos` = os que sempre aparecem (mesmo zerados).
 * `pesos` (opcional) = horas registradas por OS e técnico em QUALQUER data, para repartir as
 * horas cobradas de OS com 2 técnicos.
 */
export function agregar(
  de: string, ate: string, tecnicos: string[], dias: DiaRegistrado[], faturadas: OSFaturada[],
  pesos?: Map<string, Map<string, number>>,
  /** meta de cada pessoa (ex.: só os dias em que estava na empresa); sem isso = dias úteis do período */
  metaDe?: (tecnico: string) => number,
  /** OS preenchidas e ainda não faturadas: as horas do app nelas contam na meta como "aguardando faturar" */
  aguardandoOS?: Set<string>,
): { linhas: LinhaTecnico[]; total: LinhaTecnico } {
  const meta = diasUteis(de, ate) * HORAS_DIA
  const m = new Map<string, LinhaTecnico>()
  const de_ = (t: string) => { let l = m.get(t); if (!l) { l = linhaVazia(t, SEM_META.has(t) ? 0 : metaDe ? metaDe(t) : meta); m.set(t, l) } return l }
  for (const t of tecnicos) de_(t)

  for (const d of dias) {
    if (d.data < de || d.data > ate || !(d.horas > 0)) continue
    const l = de_(d.tecnico)
    const w = diaSemana(d.data)
    if (w === 0 || w === 6) { l.extras += d.horas; continue }
    l.trabalhadas += d.horas
    if (d.interna) l.internas += d.horas
    else { l.cliente += d.horas; if (aguardandoOS?.has(d.os)) l.aguardando += d.horas }
  }

  for (const o of faturadas) {
    if (o.data < de || o.data > ate) continue
    const tecs = o.tecnicos.length ? o.tecnicos : [SEM_TECNICO]
    const n = tecs.length
    const reg = pesos?.get(o.os)
    const somaReg = reg ? tecs.reduce((s, t) => s + (reg.get(t) || 0), 0) : 0
    for (const t of tecs) {
      const l = de_(t)
      const pesoH = somaReg > 0 ? (reg!.get(t) || 0) / somaReg : 1 / n
      l.faturadas += o.horasCobradas * pesoH
      l.km += o.km / n
      l.servico += o.servico / n; l.kmValor += o.kmValor / n; l.pecas += o.pecas / n; l.outros += o.outros / n
      l.bruto += o.bruto / n; l.custo += o.custo / n
      l.os += 1 / n
    }
  }

  const linhas = [...m.values()].map((l) => {
    const x = { ...l }
    x.liquido = x.bruto - x.custo
    x.ociosas = SEM_META.has(l.tecnico) ? 0 : Math.max(0, x.meta - x.faturadas - x.internas - x.aguardando)
    for (const k of ['trabalhadas', 'cliente', 'internas', 'extras', 'faturadas', 'aguardando', 'ociosas', 'km', 'servico', 'kmValor', 'pecas', 'outros', 'bruto', 'custo', 'liquido', 'os'] as const) x[k] = r2(x[k])
    return x
  }).sort((a, b) => (a.tecnico === SEM_TECNICO ? 1 : b.tecnico === SEM_TECNICO ? -1 : b.bruto - a.bruto || a.tecnico.localeCompare(b.tecnico, 'pt-BR')))

  const total = linhas.reduce((t, l) => {
    for (const k of ['trabalhadas', 'cliente', 'internas', 'extras', 'faturadas', 'aguardando', 'km', 'servico', 'kmValor', 'pecas', 'outros', 'bruto', 'custo', 'liquido', 'os'] as const) t[k] = r2(t[k] + l[k])
    return t
  }, linhaVazia('Equipe', 0))
  const comMeta = linhas.filter((l) => !SEM_META.has(l.tecnico))
  total.meta = r2(comMeta.reduce((s, l) => s + l.meta, 0))
  total.ociosas = r2(comMeta.reduce((s, l) => s + l.ociosas, 0))
  return { linhas, total }
}

/** Gasto do pós-vendas (abastecimento e alimentação) — ver gastos-server.ts. */
export interface Gasto {
  data: string
  pessoa: string
  tipo: 'abastecimento' | 'manutencao' | 'alimentacao' | 'materiais'
  origem: 'cartao' | 'requisicao'
  /** requisição que ainda não chegou ao financeiro: valor não confirmado, fica fora do total */
  aberto?: boolean
  valor: number
  litros: number
  /** requisição ligada a OS: já está no custo de terceiros da OS */
  naOS: boolean
  ref?: string
  placa?: string
}

export interface ResumoGastos {
  abastecimento: number
  manutencao: number
  alimentacao: number
  /** ferramenta, peça e material de uso da oficina, serviço de terceiro que não é de OS */
  materiais: number
  total: number
  /** requisições ainda não confirmadas (fora do total) */
  emAberto: number
  litros: number
  /** a parte que NÃO está no custo das OS (para o resultado não descontar duas vezes) */
  foraDasOS: number
  porPessoa: { pessoa: string; abastecimento: number; manutencao: number; alimentacao: number; materiais: number; total: number; litros: number; foraDasOS: number }[]
}

/** Soma os gastos do período, por tipo e por pessoa. */
export function resumirGastos(gastos: Gasto[], de: string, ate: string): ResumoGastos {
  const r: ResumoGastos = { abastecimento: 0, manutencao: 0, alimentacao: 0, materiais: 0, total: 0, emAberto: 0, litros: 0, foraDasOS: 0, porPessoa: [] }
  const m = new Map<string, ResumoGastos['porPessoa'][number]>()
  for (const g of gastos) {
    if (g.data < de || g.data > ate) continue
    if (g.aberto) { r.emAberto += g.valor; continue }
    r[g.tipo] += g.valor; r.total += g.valor; r.litros += g.litros
    if (!g.naOS) r.foraDasOS += g.valor
    const p = m.get(g.pessoa) || { pessoa: g.pessoa, abastecimento: 0, manutencao: 0, alimentacao: 0, materiais: 0, total: 0, litros: 0, foraDasOS: 0 }
    p[g.tipo] += g.valor; p.total += g.valor; p.litros += g.litros
    if (!g.naOS) p.foraDasOS += g.valor
    m.set(g.pessoa, p)
  }
  const arred = (n: number) => Math.round(n * 100) / 100
  for (const k of ['abastecimento', 'manutencao', 'alimentacao', 'materiais', 'total', 'emAberto', 'litros', 'foraDasOS'] as const) r[k] = arred(r[k])
  r.porPessoa = [...m.values()].map((p) => ({ ...p, abastecimento: arred(p.abastecimento), manutencao: arred(p.manutencao), alimentacao: arred(p.alimentacao), materiais: arred(p.materiais), total: arred(p.total), litros: arred(p.litros), foraDasOS: arred(p.foraDasOS) })).sort((a, b) => b.total - a.total)
  return r
}

/** Pessoa do pós-vendas (RH): salário + encargos, admissão/demissão em YYYY-MM e, por mês,
 *  comissão (já com encargos) e rescisão/acertos pagos no Omie. */
export interface MembroEquipe {
  pessoa: string; salario: number; encargos: number; admissao: string | null; demissao: string | null
  extras?: ExtraEquipe[]
}
export interface ExtraEquipe { mes: string; comissao: number; rescisao: number }
export interface CustoEquipe {
  total: number
  porPessoa: Record<string, number>
  /** salário + encargos */
  salario: number
  /** só os encargos do salário (parte de `salario`) — José, 21/10/2026: "separa o salário de encargo" */
  encargos: number
  /** encargos dentro de `comissao` e de `comissaoPrevista` */
  encComissao: number
  encPrevista: number
  /** comissão já lançada no RH (com encargos) */
  comissao: number
  /** comissão PREVISTA (mês ainda sem comissão no RH), com encargos */
  comissaoPrevista: number
  rescisao: number
  detalhe: Record<string, { salario: number; encargos: number; encComissao: number; encPrevista: number; comissao: number; comissaoPrevista: number; rescisao: number }>
}

export interface OpcoesCusto {
  /** salário do MÊS INTEIRO em cada mês tocado (José: "o que ele custou não pode se dividir ao longo do mês") */
  inteiro?: boolean
  /** só o SALÁRIO + encargos como conta fixa do mês inteiro, mesmo em semana/dia (José, 21/10/2026: "coloca o
   *  salário deles como conta fixa… está sendo dividido, mas isso só deixa mais confuso"). Período que cruza
   *  dois meses conta o salário do mês em que ele TERMINA (uma vez só). Comissão e acertos seguem o período. */
  salarioFixo?: boolean
  /** comissão prevista da pessoa entre duas datas (sem encargos) — usada no mês sem comissão no RH */
  previsao?: (pessoa: string, de: string, ate: string) => number
}

/**
 * Custo da equipe no período: (salário + encargos) de cada mês × dias do período naquele mês ÷
 * dias do mês, só nos meses entre a admissão e a demissão (como o "custo fixo RH" do sistema do Omie).
 */
export function custoEquipe(equipe: MembroEquipe[], de: string, ate: string, op: OpcoesCusto = {}): CustoEquipe {
  const r: CustoEquipe = { total: 0, porPessoa: {}, salario: 0, encargos: 0, encComissao: 0, encPrevista: 0, comissao: 0, comissaoPrevista: 0, rescisao: 0, detalhe: {} }
  if (ate < de) return r
  const diasNoMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate() }
  // meses tocados pelo período, com o trecho de cada um
  const meses: { mes: string; de: string; ate: string; frac: number }[] = []
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7); ) {
    const n = diasNoMes(m), ini = `${m}-01`, fimM = `${m}-${String(n).padStart(2, '0')}`
    const a = de > ini ? de : ini, b = ate < fimM ? ate : fimM
    const dias = Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1
    meses.push({ mes: m, de: a, ate: b, frac: op.inteiro ? 1 : dias / n })
    const [y, mm] = m.split('-').map(Number)
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
  }
  for (const p of equipe) {
    const mensal = (p.salario || 0) + (p.encargos || 0)
    const fatorEnc = p.salario ? 1 + (p.encargos || 0) / p.salario : 1.44
    const extras = new Map((p.extras || []).map((x) => [x.mes, x]))
    let sal = 0, enc = 0, com = 0, prev = 0, res = 0, encCom = 0, encPrev = 0
    for (const m of meses) {
      const ativo = !(p.admissao && m.mes < p.admissao) && !(p.demissao && m.mes > p.demissao)
      const ultimoMes = m === meses[meses.length - 1]
      const fracSal = op.inteiro ? 1 : op.salarioFixo ? (ultimoMes ? 1 : 0) : m.frac
      if (ativo) { sal += mensal * fracSal; enc += (p.encargos || 0) * fracSal }
      const x = extras.get(m.mes)
      res += (x?.rescisao || 0) * m.frac
      if (x && x.comissao > 0) { const c = x.comissao * m.frac; com += c; encCom += c - c / fatorEnc }
      else if (ativo && op.previsao) { const v = op.previsao(p.pessoa, m.de, m.ate); prev += v * fatorEnc; encPrev += v * (fatorEnc - 1) }
    }
    const tot = sal + com + prev + res
    if (tot <= 0) continue
    const a = r.detalhe[p.pessoa] || { salario: 0, encargos: 0, encComissao: 0, encPrevista: 0, comissao: 0, comissaoPrevista: 0, rescisao: 0 }
    a.salario += sal; a.encargos += enc; a.encComissao += encCom; a.encPrevista += encPrev; a.comissao += com; a.comissaoPrevista += prev; a.rescisao += res
    r.detalhe[p.pessoa] = a
    r.porPessoa[p.pessoa] = (r.porPessoa[p.pessoa] || 0) + tot
    r.salario += sal; r.encargos += enc; r.encComissao += encCom; r.encPrevista += encPrev; r.comissao += com; r.comissaoPrevista += prev; r.rescisao += res; r.total += tot
  }
  const arred = (n: number) => Math.round(n * 100) / 100
  for (const k of Object.keys(r.porPessoa)) r.porPessoa[k] = arred(r.porPessoa[k])
  for (const v of Object.values(r.detalhe)) { v.salario = arred(v.salario); v.encargos = arred(v.encargos); v.encComissao = arred(v.encComissao); v.encPrevista = arred(v.encPrevista); v.comissao = arred(v.comissao); v.comissaoPrevista = arred(v.comissaoPrevista); v.rescisao = arred(v.rescisao) }
  r.total = arred(r.total); r.salario = arred(r.salario); r.encargos = arred(r.encargos); r.encComissao = arred(r.encComissao); r.encPrevista = arred(r.encPrevista); r.comissao = arred(r.comissao); r.comissaoPrevista = arred(r.comissaoPrevista); r.rescisao = arred(r.rescisao)
  return r
}

/** Os dados brutos do painel (o servidor grava; a tela calcula qualquer período na hora). */
export interface BaseDados {
  tecnicos: string[]
  faturadas: OSFaturada[]
  diasTodos: DiaRegistrado[]
  osInternas: Record<string, { cliente: string; motivo: string }>
  /** abastecimento e alimentação do pós-vendas (pode faltar em base gravada antes de 16/10) */
  gastos?: Gasto[]
  /** salário + encargos dos técnicos (pode faltar em base antiga) */
  equipe?: MembroEquipe[]
  /** % de comissão de cada técnico (config do painel Omie) — para a comissão PREVISTA */
  pctComissao?: Record<string, number>
  /** OS internas fechadas (contrato Interno, Cortesia Oficina…), no mês em que fecharam */
  internasFechadas?: InternaFechada[]
  /** dinheiro parado agora: OS preenchidas sem faturar e OS que passaram da data sem relatório */
  pendencias?: import('./pendencias').Pendencia[]
}
export interface OSInterna { os: string; cliente: string; motivo: string; horas: number; tecnicos: string[] }

export const QTD_SERIE = { dia: 14, semana: 8, mes: 6, ano: 3 } as const

/**
 * O painel de um período a partir da base inteira — puro, roda no navegador (troca de data na hora).
 * Período em andamento conta a meta só até hoje (dia que nem chegou não vira hora ociosa).
 */
/**
 * Quem estava na empresa no período (José, 16/10/2026: "só deixa eles nas datas em que eram
 * ativos"): admissão/demissão do RH (equipe, em YYYY-MM). Quem não está no RH continua aparecendo
 * (e quem trabalhou no período aparece de qualquer jeito, pelas horas/OS dele).
 */
export function ativoEm(e: { admissao: string | null; demissao: string | null } | undefined, de: string, ate: string): boolean {
  if (!e) return true
  return (!e.admissao || e.admissao <= ate.slice(0, 7)) && (!e.demissao || e.demissao >= de.slice(0, 7))
}
export function ativosEm(base: BaseDados, de: string, ate: string): string[] {
  return base.tecnicos.filter((t) => ativoEm((base.equipe || []).find((e) => e.pessoa === t), de, ate))
}
/** Meta só dos dias úteis em que a pessoa estava na empresa. */
export function metaAtiva(base: BaseDados) {
  return (de: string, ate: string) => (t: string) => {
    const e = (base.equipe || []).find((x) => x.pessoa === t)
    if (!e) return diasUteis(de, ate) * HORAS_DIA
    let n = 0
    for (let d = de; d <= ate; d = somarDias(d, 1)) { const w = diaSemana(d); if (w >= 1 && w <= 5 && ativoEm(e, d, d)) n++ }
    return n * HORAS_DIA
  }
}

/** Troca o nome das pessoas que são GRUPO (Garantia, Outros) em todos os dados da base. */
export function agruparBase(base: BaseDados): BaseDados {
  const g = grupoDe
  return {
    ...base,
    // o grupo aparece como cartão sempre que tem salário cadastrado (mesmo sem OS no período)
    tecnicos: [...new Set([...base.tecnicos.filter((t) => !GRUPOS[t]), ...daEquipe(base.equipe).map((e) => GRUPOS[e.pessoa]).filter(Boolean)])],
    faturadas: base.faturadas.map((o) => ({ ...o, tecnicos: [...new Set(o.tecnicos.map(g))] })),
    diasTodos: base.diasTodos.map((d) => ({ ...d, tecnico: g(d.tecnico) })),
    gastos: (base.gastos || []).map((x) => ({ ...x, pessoa: g(x.pessoa) })),
    equipe: daEquipe(base.equipe).map((e) => ({ ...e, pessoa: g(e.pessoa) })),
  }
}

/** OS preenchidas (relatório feito / executada) que ainda não faturaram — garantia inclusa. */
export function osAguardandoFaturar(base: BaseDados): Set<string> {
  return new Set((base.pendencias || []).filter((p) => p.tipo === 'preenchida').map((p) => p.os))
}

/** comAguardando = false: as horas de OS preenchidas ainda não faturadas NÃO entram (caixinha da tela, José 20/10/2026). */
/** `comissaoOficial`: pessoa → mês (YYYY-MM) → comissão pela regra da ficha (comissaoDoTecnico, sem encargos).
 *  Quando vem, a previsão do mês usa ela, sem projetar (José, 21/10/2026: "a previsão de comissão não está correta"). */
export function montarPainel(baseBruta: BaseDados, tipo: 'dia' | 'semana' | 'mes' | 'ano', ref: string, hoje: string, comAguardando = true, comissaoOficial?: Record<string, Record<string, number>>) {
  const base = agruparBase(baseBruta)
  const buckets = periodos(tipo, ref, QTD_SERIE[tipo])
  const atual = buckets[buckets.length - 1]
  const p = pesosPorOS(base.diasTodos)
  const ate = (b: Bucket) => (b.ate > hoje ? hoje : b.ate)
  const aguardandoOS = comAguardando ? osAguardandoFaturar(base) : new Set<string>()
  // custo do técnico: salário do mês inteiro (mês/ano) + comissão do RH ou, sem ela, a PREVISTA
  // (regra do painel Omie; no mês em andamento, projetada até o fim do mês)
  const pctTodos = base.pctComissao || {}
  const opCusto: OpcoesCusto = {
    inteiro: tipo === 'mes' || tipo === 'ano',
    salarioFixo: true,
    previsao: (pessoa, d1, d2) => {
      const mes = d1.slice(0, 7), oficial = comissaoOficial?.[pessoa]?.[mes]
      if (oficial != null && d1.endsWith('-01') && d2.slice(0, 7) === mes && (d2 >= hoje || somarDias(d2, 1).slice(0, 7) !== mes)) return oficial
      if (!pctTodos[pessoa]) return 0
      const fim = d2 > hoje ? hoje : d2
      if (fim < d1) return 0
      const v = calcularComissoes(d1, fim, { [pessoa]: pctTodos[pessoa] }, base.faturadas, base.internasFechadas || [])[pessoa]?.total || 0
      return d2 > hoje && (tipo === 'mes' || tipo === 'ano') ? projetarMes(v, d1.slice(0, 7), hoje) : v
    },
  }
  const periodo = agregar(atual.de, ate(atual), ativosEm(base, atual.de, ate(atual)), base.diasTodos, base.faturadas, p, metaAtiva(base)(atual.de, ate(atual)), aguardandoOS)
  const serie = buckets.map((b) => {
    const r = agregar(b.de, ate(b), ativosEm(base, b.de, ate(b)), base.diasTodos, base.faturadas, p, metaAtiva(base)(b.de, ate(b)), aguardandoOS)
    return { ...b, total: r.total, porTecnico: Object.fromEntries(r.linhas.map((l) => [l.tecnico, { faturadas: l.faturadas, aguardando: l.aguardando, internas: l.internas, ociosas: l.ociosas, bruto: l.bruto, liquido: l.liquido, km: l.km }])) }
  })
  const noPeriodo = (d: string) => d >= atual.de && d <= atual.ate
  const dias = base.diasTodos.filter((d) => noPeriodo(d.data))
  const porInterna = new Map<string, OSInterna>()
  for (const d of dias) {
    if (!d.interna) continue
    const info = base.osInternas[d.os]
    const x = porInterna.get(d.os) || { os: d.os, cliente: info?.cliente || '', motivo: info?.motivo || 'interna', horas: 0, tecnicos: [] }
    x.horas = Math.round((x.horas + d.horas) * 10) / 10
    if (!x.tecnicos.includes(d.tecnico)) x.tecnicos.push(d.tecnico)
    porInterna.set(d.os, x)
  }
  return {
    tipo, ref, periodo: { de: atual.de, ate: atual.ate, rotulo: atual.rotulo },
    linhas: periodo.linhas, total: periodo.total, serie,
    os: base.faturadas.filter((o) => noPeriodo(o.data)).sort((a, b) => b.data.localeCompare(a.data)),
    dias,
    internas: [...porInterna.values()].sort((a, b) => b.horas - a.horas),
    gastos: resumirGastos(base.gastos || [], atual.de, ate(atual)),
    gastosSerie: buckets.map((b) => ({ rotulo: b.rotulo, ...resumirGastos(base.gastos || [], b.de, ate(b)) })).map((g) => ({ abastecimento: g.abastecimento, manutencao: g.manutencao, alimentacao: g.alimentacao, materiais: g.materiais, total: g.total, rotulo: g.rotulo })),
    equipe: custoEquipe(base.equipe || [], atual.de, atual.ate, opCusto),
    equipeSerie: buckets.map((b) => custoEquipe(base.equipe || [], b.de, b.ate, opCusto).total),
    notas: resumoNotas(base.faturadas.filter((o) => noPeriodo(o.data))),
    despesas: resumoDespesas(base, atual.de, ate(atual)),
    despesasAnterior: buckets.length > 1 ? { rotulo: (tipo === 'semana' ? 'semana de ' : tipo === 'dia' ? 'dia ' : '') + buckets[buckets.length - 2].rotulo, ...resumoDespesas(base, buckets[buckets.length - 2].de, ate(buckets[buckets.length - 2])) } : null,
  }
}

/** Serviço (mão de obra + km + outros itens da OS) com NFS-e × com recibo — a régua do Dashboard de Vendas. */
export function resumoNotas(os: OSFaturada[]) {
  const r = { comNota: 0, recibo: 0, qtdNota: 0, qtdRecibo: 0 }
  for (const o of os) {
    const v = o.servico + o.kmValor + o.outros
    if (o.nota) { r.comNota += v; r.qtdNota++ } else { r.recibo += v; r.qtdRecibo++ }
  }
  r.comNota = Math.round(r.comNota * 100) / 100; r.recibo = Math.round(r.recibo * 100) / 100
  return r
}
export type PainelMontado = ReturnType<typeof montarPainel>

export interface Bucket { rotulo: string; de: string; ate: string }

/** As últimas `n` semanas (segunda a domingo; a meta conta só seg–sex) terminando na semana de `hoje`. */
export function ultimasSemanas(hoje: string, n: number): Bucket[] {
  const seg = segundaDa(hoje)
  return Array.from({ length: n }, (_, i) => {
    const de = somarDias(seg, -7 * (n - 1 - i))
    return { rotulo: `${de.slice(8, 10)}/${de.slice(5, 7)}`, de, ate: somarDias(de, 6) }
  })
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** Os últimos `n` meses terminando no mês de `hoje`. */
export function ultimosMeses(hoje: string, n: number): Bucket[] {
  const [a, mm] = hoje.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const k = (a * 12 + (mm - 1)) - (n - 1 - i)
    const ano = Math.floor(k / 12), mes = (k % 12) + 1
    const de = `${ano}-${String(mes).padStart(2, '0')}-01`
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
    return { rotulo: `${MESES[mes - 1]}/${String(ano).slice(2)}`, de, ate: `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}` }
  })
}

/**
 * OS INTERNA (regra do José, 16/10/2026) — não é cobrada do cliente quando:
 *  - no portal, o tipo de serviço é interno (Servico_Interno); ou
 *  - no Omie, a conta corrente é a conta interna; ou
 *  - no Omie, o "Nº do Contrato de Venda" é um código interno (lista CODIGOS_INTERNOS).
 * Contrato terminado em "-pgo" NÃO é interno: a montadora paga (garantia/PDI).
 * Devolve o motivo (para mostrar na tela) ou null.
 */
export function motivoInterna(o: { servicoInterno?: unknown; conta?: unknown; contratos?: unknown[] }, contaInterna: number, codigosInternos: string[]): string | null {
  if (o.servicoInterno) return 'tipo de serviço interno'
  if (Number(o.conta) === contaInterna) return 'conta corrente interna'
  const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  const internos = new Set(codigosInternos.map(norm))
  for (const c of o.contratos || []) {
    const n = norm(c)
    if (n && internos.has(n) && !/-pgo$/.test(n)) return `contrato ${String(c).trim()}`
  }
  return null
}

/** Os últimos `n` dias terminando em `hoje` (cada dia um período). */
export function ultimosDias(hoje: string, n: number): Bucket[] {
  return Array.from({ length: n }, (_, i) => { const d = somarDias(hoje, -(n - 1 - i)); return { rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`, de: d, ate: d } })
}

/** Os últimos `n` anos terminando no ano de `hoje`. */
export function ultimosAnos(hoje: string, n: number): Bucket[] {
  const a = Number(hoje.slice(0, 4))
  return Array.from({ length: n }, (_, i) => { const y = a - (n - 1 - i); return { rotulo: String(y), de: `${y}-01-01`, ate: `${y}-12-31` } })
}

export type Escala = 'dia' | 'semana' | 'mes' | 'ano'
export const ESCALAS: Escala[] = ['dia', 'semana', 'mes', 'ano']

/** Os `n` períodos da escala que terminam no período de `ref`. */
export function periodos(escala: Escala, ref: string, n: number): Bucket[] {
  return escala === 'dia' ? ultimosDias(ref, n) : escala === 'semana' ? ultimasSemanas(ref, n) : escala === 'mes' ? ultimosMeses(ref, n) : ultimosAnos(ref, n)
}

/** Anda `n` períodos a partir de `ref` (devolve um dia dentro do período novo). */
export function andarPeriodo(escala: Escala, ref: string, n: number): string {
  if (escala === 'dia') return somarDias(ref, n)
  if (escala === 'semana') return somarDias(ref, 7 * n)
  const [a, m] = ref.split('-').map(Number)
  if (escala === 'ano') return `${a + n}-${String(m).padStart(2, '0')}-15`
  const k = a * 12 + m - 1 + n
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-15`
}

/** Horas registradas por OS e técnico (para repartir as horas cobradas). */
export function pesosPorOS(dias: DiaRegistrado[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const d of dias) {
    const x = m.get(d.os) || new Map<string, number>()
    x.set(d.tecnico, (x.get(d.tecnico) || 0) + d.horas)
    m.set(d.os, x)
  }
  return m
}

/**
 * O cartão-frota chega por PLANILHA (Frota → Abastecimento), não sozinho. Devolve o que falta no
 * período: dias depois da última transação importada e meses inteiros sem nenhuma transação.
 */
export function faltasCartao(gastos: Gasto[], de: string, ate: string): { ultimo: string | null; depoisDe: string | null; mesesSem: string[] } {
  const dias = gastos.filter((g) => g.origem === 'cartao').map((g) => g.data).sort()
  if (!dias.length) return { ultimo: null, depoisDe: null, mesesSem: [] }
  const primeiro = dias[0], ultimo = dias[dias.length - 1]
  const comCartao = new Set(dias.map((d) => d.slice(0, 7)))
  const mesesSem: string[] = []
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7) && m < ultimo.slice(0, 7); ) {
    if (m > primeiro.slice(0, 7) && !comCartao.has(m)) mesesSem.push(m)
    const [a, mm] = m.split('-').map(Number)
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`
  }
  return { ultimo, depoisDe: ate > ultimo ? ultimo : null, mesesSem }
}

import { calcularComissoes, projetarMes } from './comissao'

/** Contratos que a oficina assume (o José quer ver em destaque). */
export const CONTRATOS_ATENCAO = ['interno', 'cortesia oficina']
export const contratoAtencao = (c: string) => CONTRATOS_ATENCAO.includes(String(c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase())

/** Tudo que o pós-vendas gastou ou deixou de cobrar no período, separado. */
export function resumoDespesas(base: BaseDados, de: string, ate: string) {
  const g = resumirGastos(base.gastos || [], de, ate)
  const os = base.faturadas.filter((o) => o.data >= de && o.data <= ate)
  const terceiros = os.reduce((a, o) => a + o.custo, 0)
  const desc: Descontos & { total: number; qtdOS: number } = { hora: 0, km: 0, geral: 0, pecas: 0, total: 0, qtdOS: 0 }
  for (const o of os) {
    const d = o.descontos
    if (!d) continue
    const t = d.hora + d.km + d.geral + d.pecas
    if (t <= 0.009) continue
    desc.hora += d.hora; desc.km += d.km; desc.geral += d.geral; desc.pecas += d.pecas; desc.total += t; desc.qtdOS++
  }
  const internas = (base.internasFechadas || []).filter((x) => x.data >= de && x.data <= ate)
  const porContrato: Record<string, { qtd: number; valor: number; horas: number }> = {}
  for (const x of internas) {
    const k = x.contrato || x.motivo || 'interna'
    const c = porContrato[k] || { qtd: 0, valor: 0, horas: 0 }
    c.qtd++; c.valor += x.valor; c.horas += x.horas
    porContrato[k] = c
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    abastecimento: g.abastecimento, manutencao: g.manutencao, alimentacao: g.alimentacao, materiais: g.materiais, emAberto: g.emAberto,
    terceiros: r2(terceiros),
    gastosTotal: r2(g.total + terceiros),
    internas: { qtd: internas.length, valor: r2(internas.reduce((a, x) => a + x.valor, 0)), horas: r2(internas.reduce((a, x) => a + x.horas, 0)), porContrato },
    descontos: { hora: r2(desc.hora), km: r2(desc.km), geral: r2(desc.geral), pecas: r2(desc.pecas), total: r2(desc.total), qtdOS: desc.qtdOS },
  }
}
export type ResumoDespesas = ReturnType<typeof resumoDespesas>
