// Centro do Pós-Vendas guardado em TABELAS (José, 16/10/2026: "guardar todas as informações em
// tabela"). sql/posvendas-tabelas.sql.
//   posvendas_os      — uma linha por OS faturada (mão de obra, deslocamento, peças, terceiros…)
//   posvendas_horas   — horas do app por OS × dia × técnico (com o motivo quando é interna)
//   posvendas_gastos  — abastecimento, manutenção do carro e alimentação, por pessoa
//   posvendas_equipe  — salário + encargos dos técnicos
// sincronizarPosVendas regrava uma janela de datas (apaga a janela e grava de novo — assim o que
// deixou de existir na fonte também some). lerBaseDasTabelas monta a base que a tela usa.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarBase, padronizador } from './painel-server'
import { padronizadorOcorrencias } from './ocorrencias-server'
import { carregarGastos, carregarEquipe, carregarPctComissao } from './gastos-server'
import type { BaseDados, Descontos, DiaRegistrado, ExtraEquipe, Gasto, InternaFechada, OSFaturada, ReqCusto } from './painel'
import { carregarPendencias, idsGarantia, numsComNota } from './pendencias-server'
import type { Pendencia } from './pendencias'

type Rec = Record<string, unknown>
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const anoInicialBase = () => `${Number(hojeSP().slice(0, 4)) - 3}-01-01`

export class TabelasFaltando extends Error { constructor() { super('Tabelas do pós-vendas não criadas (rode sql/posvendas-tabelas.sql)') } }
const faltou = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''))
function ok(res: { error: { code?: string; message: string } | null }) {
  if (faltou(res.error)) throw new TabelasFaltando()
  if (res.error) throw new Error(res.error.message)
}

async function inserirEmLotes(tabela: string, linhas: Rec[]) {
  for (let i = 0; i < linhas.length; i += 500) ok(await sb.from(tabela).upsert(linhas.slice(i, i + 500)))
}

const semCampo = (o: Rec, k: string) => { const c = { ...o }; delete c[k]; return c }

// sql/posvendas-despesas.sql ainda não rodado: coluna nova ou tipo novo recusado
const semMigracaoDespesas = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '23514' || e.code === 'PGRST204' || e.code === '42703' || /aberto|extras|tipo_check/i.test(e.message || ''))

/** Grava com as colunas novas; sem a migration, grava no formato antigo (sem o que ela traz). */
async function inserirComFallback(tabela: string, linhas: Rec[], antigo: (l: Rec[]) => Rec[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    const r = await sb.from(tabela).upsert(lote)
    if (semMigracaoDespesas(r.error)) {
      console.warn(`[pos-tabelas] ${tabela}: rode sql/posvendas-despesas.sql (gravando no formato antigo)`)
      const velho = antigo(lote)
      if (velho.length) ok(await sb.from(tabela).upsert(velho))
    } else ok(r)
  }
}

async function paginar(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<Rec[]> {
  const out: Rec[] = []
  for (let de = 0; de < 200000; de += 1000) {
    const res = await montar(de, de + 999)
    ok(res)
    const l = (res.data || []) as Rec[]
    out.push(...l)
    if (l.length < 1000) break
  }
  return out
}

/** Quem é do pós-vendas: técnico no cadastro OU tem hora no app OU aparece em OS faturada. */
function tecnicosDe(cadastro: string[], dias: DiaRegistrado[], faturadas: OSFaturada[]) {
  return new Set([...cadastro, ...dias.map((d) => d.tecnico), ...faturadas.flatMap((o) => o.tecnicos)].filter(Boolean))
}

/** Regrava as tabelas entre `de` e `ate` (YYYY-MM-DD). Devolve quantas linhas gravou. */
export async function sincronizarPosVendas(de: string, ate: string) {
  const { padronizar } = await padronizadorOcorrencias()
  const base = await carregarBase(de, ate)
  const dias = base.diasTodos.filter((d) => d.data >= de && d.data <= ate)
  const tecnicos = tecnicosDe(base.tecnicos, base.diasTodos, base.faturadas)
  const [gastos, equipe] = await Promise.all([carregarGastos(de, ate, padronizar, tecnicos), carregarEquipe(padronizar, tecnicos)])
  const agora = new Date().toISOString()

  const linhasOS = base.faturadas.filter((o) => o.data >= de && o.data <= ate).map((o) => ({
    os: o.os, numero_omie: o.numeroOmie, cliente: o.cliente, data: o.data, faturado_em: o.em, tecnicos: o.tecnicos,
    horas_cobradas: o.horasCobradas, km: o.km, mao_de_obra: o.servico, deslocamento: o.kmValor, pecas: o.pecas, outros: o.outros,
    bruto: o.bruto, custo_terceiros: o.custo, custo_por_tipo: o.custoPorTipo || {}, requisicoes: o.requisicoes || [], descontos: o.descontos || null, atualizado_em: agora,
  }))
  const cont = new Map<string, number>()
  const linhasHoras = dias.map((d) => {
    const k = `${d.os}|${d.data}|${d.tecnico}`
    const n = (cont.get(k) || 0) + 1; cont.set(k, n)
    const info = base.osInternas[d.os]
    return { chave: `${k}|${n}`, os: d.os, data: d.data, tecnico: d.tecnico, horas: d.horas, interna: d.interna, motivo_interna: d.interna ? info?.motivo || 'interna' : null, cliente: info?.cliente || null, atualizado_em: agora }
  })
  const linhasGastos = gastos.map((g) => ({ chave: g.ref || `${g.origem}:${g.data}:${g.pessoa}:${g.valor}`, data: g.data, pessoa: g.pessoa, tipo: g.tipo, origem: g.origem, placa: g.placa || null, valor: g.valor, litros: g.litros, ref: g.ref || null, aberto: !!g.aberto, atualizado_em: agora }))
  // a mesma requisição pode vir 2x se mudar de tipo no meio — a chave é única
  const unicosGastos = [...new Map(linhasGastos.map((l) => [l.chave, l])).values()]

  // apaga a janela e grava de novo (o que sumiu da fonte some daqui também)
  ok(await sb.from('posvendas_os').delete().gte('data', de).lte('data', ate))
  ok(await sb.from('posvendas_horas').delete().gte('data', de).lte('data', ate))
  ok(await sb.from('posvendas_gastos').delete().gte('data', de).lte('data', ate))
  await inserirComFallback('posvendas_os', linhasOS, (l) => l.map((x) => semCampo(x, 'descontos')))
  await inserirEmLotes('posvendas_horas', linhasHoras)
  // formato antigo: sem "materiais" e sem as requisições em aberto (que lá contariam como confirmadas)
  await inserirComFallback('posvendas_gastos', unicosGastos, (l) => l.filter((x) => x.tipo !== 'materiais' && !x.aberto).map((x) => semCampo(x, 'aberto')))
  ok(await sb.from('posvendas_equipe').delete().neq('pessoa', ''))
  await inserirComFallback('posvendas_equipe', equipe.map((m) => ({ pessoa: m.pessoa, nome_rh: m.nomeRh, salario: m.salario, encargos: m.encargos, admissao: m.admissao, demissao: m.demissao, extras: m.extras || [], atualizado_em: agora })),
    (l) => l.map((x) => semCampo(x, 'extras')))
  // OS internas fechadas (tabela própria; se ainda não existe, o resto segue)
  try {
    ok(await sb.from('posvendas_internas').delete().gte('data', de).lte('data', ate))
    await inserirEmLotes('posvendas_internas', base.internasFechadas.map((x) => ({ os: x.os, numero_omie: x.numeroOmie, cliente: x.cliente, contrato: x.contrato, motivo: x.motivo, data: x.data, valor: x.valor, horas: x.horas, tecnicos: x.tecnicos, atualizado_em: agora })))
  } catch (e) { if (!(e instanceof TabelasFaltando)) console.error('[pos-tabelas] internas', e) }
  // dinheiro parado: foto de agora (tabela própria; se ainda não existe, o resto segue)
  let pendencias = 0
  try {
    const faturadas = new Set((await paginar((x, y) => sb.from('posvendas_os').select('os').range(x, y))).map((r) => String(r.os)))
    const lista = await carregarPendencias(faturadas, padronizar)
    ok(await sb.from('posvendas_pendencias').delete().neq('os', ''))
    await inserirEmLotes('posvendas_pendencias', lista.map((p) => ({ os: p.os, tipo: p.tipo, status: p.status, cliente: p.cliente, tecnicos: p.tecnicos, data_ref: p.dataRef, dias: p.dias, mao_de_obra: p.maoDeObra, deslocamento: p.deslocamento, pecas: p.pecas, total: p.total, garantia: p.garantia, atualizado_em: agora })))
    pendencias = lista.length
  } catch (e) { if (!(e instanceof TabelasFaltando)) console.error('[pos-tabelas] pendências', e) }
  return { os: linhasOS.length, horas: linhasHoras.length, gastos: unicosGastos.length, equipe: equipe.length, pendencias }
}

/** A base da tela lida das tabelas (null = tabelas vazias). */
export async function lerBaseDasTabelas(): Promise<(BaseDados & { de: string; ate: string; geradoEm: string }) | null> {
  const de = anoInicialBase()
  // tudo em paralelo (José 19/10: "tá muito demorado") — antes eram 4 rodadas em sequência
  const [os, horas, gastos, equipe, { tecnicos }, pendLidas, internas, { padronizar: padr }, garantias, comNota] = await Promise.all([
    paginar((x, y) => sb.from('posvendas_os').select('*').gte('data', de).order('data').range(x, y)),
    paginar((x, y) => sb.from('posvendas_horas').select('os, data, tecnico, horas, interna, motivo_interna, cliente, atualizado_em').gte('data', de).order('chave').range(x, y)),
    paginar((x, y) => sb.from('posvendas_gastos').select('*').gte('data', de).order('chave').range(x, y)),
    paginar((x, y) => sb.from('posvendas_equipe').select('*').range(x, y)),
    padronizador(),
    paginar((x, y) => sb.from('posvendas_pendencias').select('*').order('dias', { ascending: false }).range(x, y)).catch((): Rec[] => []), // tabela pode não existir
    paginar((x, y) => sb.from('posvendas_internas').select('*').gte('data', de).order('os').range(x, y)).catch((): Rec[] => []), // sql/posvendas-despesas.sql
    padronizadorOcorrencias(),
    idsGarantia().catch(() => new Set<string>()),
    numsComNota().catch(() => new Set<string>()),
  ])
  if (!os.length && !horas.length) return null
  const pend: Rec[] = pendLidas
  let pendCalc: Pendencia[] | null = null
  // sem tabela, ou o robô ainda não gravou: calcula na hora (junto com o % de comissão)
  const [pc, pctComissao] = await Promise.all([
    pend.length ? Promise.resolve(null) : carregarPendencias(new Set(os.map((o) => String(o.os))), padr).catch(() => []),
    carregarPctComissao(padr, new Set(equipe.map((e) => String(e.pessoa)))).catch(() => ({})),
  ])
  pendCalc = pc
  const num = (v: unknown) => Number(v) || 0
  const osInternas: BaseDados['osInternas'] = {}
  for (const h of horas) if (h.interna) osInternas[String(h.os)] = { cliente: String(h.cliente || ''), motivo: String(h.motivo_interna || 'interna') }
  const geradoEm = [...os, ...horas].reduce((m, r) => (String(r.atualizado_em) > m ? String(r.atualizado_em) : m), '')
  return {
    de, ate: hojeSP(), geradoEm: geradoEm || new Date().toISOString(),
    tecnicos,
    faturadas: os.map((o) => ({
      os: String(o.os), numeroOmie: (o.numero_omie as string) || null, cliente: String(o.cliente || ''), data: String(o.data), em: (o.faturado_em as string) || null,
      tecnicos: (o.tecnicos as string[]) || [], horasCobradas: num(o.horas_cobradas), km: num(o.km), servico: num(o.mao_de_obra), kmValor: num(o.deslocamento),
      pecas: num(o.pecas), outros: num(o.outros), bruto: num(o.bruto), custo: num(o.custo_terceiros),
      custoPorTipo: (o.custo_por_tipo as Record<string, number>) || {}, requisicoes: (o.requisicoes as ReqCusto[]) || [],
      garantia: garantias.has(String(o.os)),
      nota: !!o.numero_omie && comNota.has(String(o.numero_omie)),
      descontos: (o.descontos as Descontos) || undefined,
    })),
    diasTodos: horas.map((h) => ({ os: String(h.os), data: String(h.data), tecnico: String(h.tecnico), horas: num(h.horas), interna: !!h.interna })),
    osInternas,
    gastos: gastos.map((g) => ({ data: String(g.data), pessoa: String(g.pessoa), tipo: g.tipo as Gasto['tipo'], origem: g.origem as Gasto['origem'], valor: num(g.valor), litros: num(g.litros), naOS: false, ref: (g.ref as string) || undefined, placa: (g.placa as string) || undefined, aberto: g.aberto ? true : undefined })),
    equipe: equipe.map((e) => ({ pessoa: String(e.pessoa), salario: num(e.salario), encargos: num(e.encargos), admissao: (e.admissao as string) || null, demissao: (e.demissao as string) || null, extras: Array.isArray(e.extras) ? (e.extras as ExtraEquipe[]) : undefined })),
    pctComissao,
    internasFechadas: internas.map((x): InternaFechada => ({ os: String(x.os), numeroOmie: (x.numero_omie as string) || null, cliente: String(x.cliente || ''), contrato: String(x.contrato || ''), motivo: String(x.motivo || ''), data: String(x.data), valor: num(x.valor), horas: num(x.horas), tecnicos: (x.tecnicos as string[]) || [] })),
    pendencias: pendCalc || pend.map((p): Pendencia => ({ os: String(p.os), tipo: p.tipo as Pendencia['tipo'], status: String(p.status || ''), cliente: String(p.cliente || ''), tecnicos: (p.tecnicos as string[]) || [], dataRef: (p.data_ref as string) || null, dias: num(p.dias), maoDeObra: num(p.mao_de_obra), deslocamento: num(p.deslocamento), pecas: num(p.pecas), total: num(p.total), garantia: !!p.garantia })),
  }
}
