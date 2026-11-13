// Pós-Vendas da tela do diretor (/empresa → Pós-Vendas). José, 12/11/2026: "mostrar o faturamento do pós-vendas,
// separando por garantia, internas, como é feito lá na Gestão do Pós-Vendas; e uma aba de técnicos com quantas horas
// fizeram por semana e mês; clicando, os cards de cada técnico, como os dos vendedores".
// MESMAS contas da Gestão (nada novo):
//   • faturamento → itensDaBase (OS faturadas, garantias do módulo, internas fechadas, ainda não faturadas)
//   • horas       → agregar (trabalhadas no app seg–sex, extras no fim de semana, faturadas, internas, meta, ociosas)
// Gravado em empresa_painel (area 'posvendas') pelo robô empresa-snapshot; a tela só lê.
import { baseComCache } from '@/lib/mecanicos/base-cache'
import { garantiasPainelComCache } from '@/lib/mecanicos/garantias-lista'
import { itensDaBase, type GarantiaModulo, type Grupo } from '@/lib/mecanicos/itens-periodo'
import { agregar, agruparBase, ativosEm, metaAtiva, pesosPorOS, osAguardandoFaturar, ultimasSemanas, ultimosMeses, SEM_META, SEM_TECNICO, type BaseDados, type Bucket } from '@/lib/mecanicos/painel'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

export interface OsPv { os: string; numero: string | null; cliente: string; tecnicos: string[]; data: string; grupo: Grupo; subtipo?: string; bruto: number; servico: number; horas: number; kmValor: number; pecas: number; outros: number }
export interface MesPv { mes: string; parcial: boolean; porGrupo: Record<Grupo, { valor: number; n: number }>; internas: Record<string, { valor: number; n: number }>; total: number; servico: number; kmValor: number; pecas: number; outros: number }
/** horas de um técnico num período (semana ou mês) */
export interface HorasPv { de: string; ate: string; rotulo: string; trabalhadas: number; cliente: number; internas: number; extras: number; faturadas: number; aguardando: number; ociosas: number; meta: number; bruto: number; os: number }
export interface TecnicoPv { nome: string; grupo: boolean; semanas: HorasPv[]; meses: HorasPv[] }
export interface DadosPosVendas { hoje: string; meses: MesPv[]; os: OsPv[]; tecnicos: TecnicoPv[]; equipeSemanas: HorasPv[]; equipeMeses: HorasPv[]; geradoEm: string }

const GRUPOS: Grupo[] = ['faturada', 'garantia', 'interna', 'aguardando']
// totais por mês desde janeiro de 3 anos atrás (José, 12/11: "deixa a gente trocar o ano"); a lista de OS, só 13 meses
const ANOS_ATRAS = 3, QTD_MESES_OS = 13, QTD_SEMANAS = 12

export async function montarPosVendas(): Promise<DadosPosVendas> {
  const hoje = hojeSP()
  const [{ dados: base }, gar] = await Promise.all([baseComCache(false), garantiasPainelComCache(false).then((r) => r.dados as unknown as { garantias?: GarantiaModulo[] }).catch(() => ({ garantias: [] as GarantiaModulo[] }))])
  const bb = base as unknown as BaseDados

  // ── faturamento por tipo (lista da Gestão) ──
  const meses = ultimosMeses(hoje, ANOS_ATRAS * 12 + Number(hoje.slice(5, 7)))
  const ini = meses[0].de, iniOs = ultimosMeses(hoje, QTD_MESES_OS)[0].de
  const itens = itensDaBase(bb, gar.garantias || []).filter((o) => o.data >= ini && o.data <= hoje)
  const todos: OsPv[] = itens.map((o) => ({ os: o.os, numero: o.numero, cliente: o.cliente, tecnicos: o.tecnicos, data: o.data, grupo: o.grupo, ...(o.subtipo ? { subtipo: o.subtipo } : {}), bruto: r2(o.bruto), servico: r2(o.servico), horas: r1(o.horas), kmValor: r2(o.kmValor), pecas: r2(o.pecas), outros: r2(o.outros) }))
  const mesesPv: MesPv[] = meses.map((b, i) => {
    const l = todos.filter((o) => o.data >= b.de && o.data <= b.ate)
    const porGrupo = Object.fromEntries(GRUPOS.map((g) => [g, { valor: 0, n: 0 }])) as MesPv['porGrupo']
    const internas: MesPv['internas'] = {}
    const m: MesPv = { mes: b.de.slice(0, 7), parcial: i === meses.length - 1, porGrupo, internas, total: 0, servico: 0, kmValor: 0, pecas: 0, outros: 0 }
    for (const o of l) {
      porGrupo[o.grupo].valor += o.bruto; porGrupo[o.grupo].n++
      if (o.grupo === 'interna') { const k = o.subtipo || 'Interno'; internas[k] = internas[k] || { valor: 0, n: 0 }; internas[k].valor += o.bruto; internas[k].n++ }
      m.total += o.bruto; m.servico += o.servico; m.kmValor += o.kmValor; m.pecas += o.pecas; m.outros += o.outros
    }
    for (const g of GRUPOS) porGrupo[g].valor = r2(porGrupo[g].valor)
    for (const k of ['total', 'servico', 'kmValor', 'pecas', 'outros'] as const) m[k] = r2(m[k])
    return m
  })

  const os = todos.filter((o) => o.data >= iniOs)

  // ── horas por técnico (conta da Gestão) ──
  const base2 = agruparBase(bb)
  const pesos = pesosPorOS(base2.diasTodos)
  const aguardandoOS = osAguardandoFaturar(base2)
  const meta = metaAtiva(base2)
  const fim = (b: Bucket) => (b.ate > hoje ? hoje : b.ate)
  const porBucket = (bs: Bucket[]) => bs.map((b) => ({ b, r: agregar(b.de, fim(b), ativosEm(base2, b.de, fim(b)), base2.diasTodos, base2.faturadas, pesos, meta(b.de, fim(b)), aguardandoOS) }))
  const semanas = porBucket(ultimasSemanas(hoje, QTD_SEMANAS)), mesesH = porBucket(ultimosMeses(hoje, 12))
  const h = (b: Bucket, l: { trabalhadas: number; cliente: number; internas: number; extras: number; faturadas: number; aguardando: number; ociosas: number; meta: number; bruto: number; os: number } | undefined): HorasPv => ({
    de: b.de, ate: b.ate, rotulo: b.rotulo,
    trabalhadas: r1(l?.trabalhadas || 0), cliente: r1(l?.cliente || 0), internas: r1(l?.internas || 0), extras: r1(l?.extras || 0), faturadas: r1(l?.faturadas || 0),
    aguardando: r1(l?.aguardando || 0), ociosas: r1(l?.ociosas || 0), meta: r1(l?.meta || 0), bruto: r2(l?.bruto || 0), os: r1(l?.os || 0),
  })
  // quem aparece: ativo no mês atual ou com horas nas últimas semanas (sem "Sem técnico")
  const nomes = new Set<string>()
  for (const x of [...semanas.slice(-4), ...mesesH.slice(-1)]) for (const l of x.r.linhas) if (l.tecnico !== SEM_TECNICO && (l.trabalhadas > 0 || l.faturadas > 0 || (!SEM_META.has(l.tecnico) && l.meta > 0))) nomes.add(l.tecnico)
  const tecnicos: TecnicoPv[] = [...nomes].map((nome) => ({
    nome, grupo: SEM_META.has(nome),
    semanas: semanas.map(({ b, r }) => h(b, r.linhas.find((l) => l.tecnico === nome))),
    meses: mesesH.map(({ b, r }) => h(b, r.linhas.find((l) => l.tecnico === nome))),
  })).sort((a, b) => Number(a.grupo) - Number(b.grupo) || (b.meses.at(-1)!.trabalhadas - a.meses.at(-1)!.trabalhadas))
  // equipe = soma dos técnicos de campo (sem os grupos Garantia/Outros)
  const soma = (k: 'semanas' | 'meses', i: number, b: Bucket): HorasPv => {
    const x = h(b, undefined)
    for (const t of tecnicos.filter((t) => !t.grupo)) {
      const y = t[k][i]
      for (const c of ['trabalhadas', 'cliente', 'internas', 'extras', 'faturadas', 'aguardando', 'ociosas', 'meta', 'bruto', 'os'] as const) x[c] = r2(x[c] + y[c])
    }
    return x
  }
  return {
    hoje, meses: mesesPv, os, tecnicos,
    equipeSemanas: semanas.map(({ b }, i) => soma('semanas', i, b)),
    equipeMeses: mesesH.map(({ b }, i) => soma('meses', i, b)),
    geradoEm: new Date().toISOString(),
  }
}
