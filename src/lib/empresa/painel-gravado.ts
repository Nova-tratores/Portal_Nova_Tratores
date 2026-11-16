// Áreas da tela do diretor (/empresa) já calculadas e guardadas na tabela empresa_painel (José, 11/11: "todas as
// informações de todos os módulos têm que ser salvas em tabelas para não demorarem na hora de carregar").
//
// • O robô `empresa-snapshot` (agendador) recalcula e grava cada área.
// • A tela lê a linha gravada (uma consulta só). Se a tabela não existe ainda ou a área nunca foi gravada,
//   calcula na hora e tenta gravar — a tela nunca fica vazia por falta do robô.
// • "Atualizar agora" (?recalcular=1) refaz a conta e grava por cima.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { montarComercial, montarPropostas, lerMetas } from './comercial'
import { montarVendedores } from './vendedores'
import { montarMaquinas } from './maquinas'
import { montarPosVendas } from './posvendas'
import { montarPecas } from './pecas'
import { consultarDREPorPeriodo } from '@/lib/dre-financeiro/omie-api'
import { montarDreGerencial, semIntercompany, type MovDre, type SetorG, type Linha } from './dre-gerencial'

export type AreaGravada = 'comercial' | 'dre-gerencial' | 'vendedores' | 'maquinas' | 'dre-24' | 'posvendas' | 'pecas'
export const AREAS_GRAVADAS: AreaGravada[] = ['comercial', 'vendedores', 'maquinas', 'dre-gerencial', 'dre-24', 'posvendas', 'pecas']

const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** DRE gerencial por setor dos últimos N meses (era a conta da rota /api/empresa/dre-gerencial). */
export async function montarDreGerencialMeses(n = 6) {
  const hoje = new Date()
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1), 1)
  const [nova, castro] = await Promise.all([
    consultarDREPorPeriodo('nova', chave(ini), chave(hoje), '1', false),
    consultarDREPorPeriodo('castro', chave(ini), chave(hoje), '1', false),
  ]) as [Array<MovDre & { _ano: number; _mes: number }>, Array<MovDre & { _ano: number; _mes: number }>]
  const meses = [], porMes: MesLanc[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(ini.getFullYear(), ini.getMonth() + i, 1)
    const a = d.getFullYear(), m = d.getMonth() + 1
    const doMes = [
      ...semIntercompany(nova.filter((x) => x._ano === a && x._mes === m), 'nova').map((x) => ({ ...x, _conta: 'nova' })),
      ...semIntercompany(castro.filter((x) => x._ano === a && x._mes === m), 'castro').map((x) => ({ ...x, _conta: 'castro' })),
    ]
    const itens: LancGravado[] = []
    const dg = montarDreGerencial(doMes, (mv, setor, linha) => { if (linha !== 'receita') itens.push(lancDe(mv, setor, linha)) })
    porMes.push({ mes: chave(d), itens, parteReceita: dg.parteReceita })
    meses.push({ mes: chave(d), parcial: i === n - 1, lancamentos: doMes.length, ...dg })
  }
  await gravarLancamentos(porMes)
  return { meses, geradoEm: new Date().toISOString() }
}

// ── lançamentos de cada mês, já com setor e linha, numa linha da tabela por mês (area = 'lanc:2026-11') ──
// José, 12/11: a janela de "Parte das despesas gerais" (e as outras da tela de Despesas) não pode ficar carregando.
// Quem grava é a mesma conta do DRE gerencial (robô a cada 30 min e a área dre-24); a janela só lê.
export type LancGravado = { nome: string; data: string; valor: number; categoria: string; detalhe: string; doc: string; origem: string; departamento: string; conta: string; dreConta: string; empresa: string; setor: SetorG | null; linha: Linha }
export type MesLanc = { mes: string; itens: LancGravado[]; parteReceita: Record<string, number> }
type MovX = MovDre & { nomeClienteFornecedor?: string; dataMovimento?: string; detalheConta?: string; _conta?: string }
function lancDe(m0: MovDre, setor: SetorG | null, linha: Linha): LancGravado {
  const m = m0 as MovX
  return {
    nome: String(m.nomeClienteFornecedor || '').trim() || 'sem nome', data: String(m.dataMovimento || ''), valor: Number(m.valor) || 0,
    categoria: String(m.categoria || ''), detalhe: String(m.detalheConta || ''), doc: String(m.numeroDocFiscal || '').trim(), origem: String(m.origem || ''),
    departamento: String(m.departamento || '').replace(/^d+.s*/, ''), conta: String(m.dreConta || '').replace(/^s*[d.]+s*/, ''), dreConta: String(m.dreConta || ''),
    empresa: m._conta || 'nova', setor, linha,
  }
}
async function gravarLancamentos(porMes: MesLanc[]) {
  const agora = new Date().toISOString()
  for (let i = 0; i < porMes.length; i += 4) { // 4 meses por vez (cada mês ~400 KB)
    const linhas = porMes.slice(i, i + 4).map((x) => ({ area: `lanc:${x.mes}`, dados: x, calculado_em: agora, duracao_ms: null, erro: null }))
    const { error } = await supabaseAdmin.from('empresa_painel').upsert(linhas, { onConflict: 'area' })
    if (error && !tabelaFalta(error)) console.warn(`[empresa-painel] gravar lançamentos: ${error.message}`)
  }
}
/** um mês só (quando ainda não foi gravado): busca o DRE do mês, classifica e grava */
async function montarLancMes(mes: string): Promise<MesLanc> {
  const [nova, castro] = await Promise.all([
    consultarDREPorPeriodo('nova', mes, mes, '1', false),
    consultarDREPorPeriodo('castro', mes, mes, '1', false),
  ]) as [MovDre[], MovDre[]]
  const doMes = [...semIntercompany(nova, 'nova').map((x) => ({ ...x, _conta: 'nova' })), ...semIntercompany(castro, 'castro').map((x) => ({ ...x, _conta: 'castro' }))]
  const itens: LancGravado[] = []
  const dg = montarDreGerencial(doMes, (mv, setor, linha) => { if (linha !== 'receita') itens.push(lancDe(mv, setor, linha)) })
  const x = { mes, itens, parteReceita: dg.parteReceita }
  await gravarLancamentos([x])
  return x
}
const refazendoLanc = new Set<string>()
/** Lê os lançamentos gravados do mês. Mês recente velho → devolve o gravado e refaz por trás. */
export async function lerLancamentos(mes: string): Promise<MesLanc> {
  const { data, error } = await supabaseAdmin.from('empresa_painel').select('dados,calculado_em').eq('area', `lanc:${mes}`).maybeSingle()
  if (!error && data?.dados) {
    const recente = mes >= chave(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))
    if (recente && Date.now() - new Date(String(data.calculado_em)).getTime() > VELHO_MS && !refazendoLanc.has(mes)) {
      refazendoLanc.add(mes)
      void montarLancMes(mes).catch(() => {}).finally(() => refazendoLanc.delete(mes))
    }
    return data.dados as MesLanc
  }
  return montarLancMes(mes)
}

const CALCULO: Record<AreaGravada, () => Promise<unknown>> = {
  comercial: () => montarComercial(12),
  'dre-gerencial': () => montarDreGerencialMeses(6),
  'dre-24': () => montarDreGerencialMeses(24), // comparar com os meses/anos anteriores (José, 12/11)
  vendedores: () => montarVendedores(30),
  maquinas: () => montarMaquinas(),
  posvendas: () => montarPosVendas(),
  pecas: () => montarPecas(), // vendas por canal, pedidos e estoque de peças (José, 12/11) // faturamento por tipo + horas dos técnicos (José, 12/11)
}

// Formato de cada área: sobe o número quando a conta muda (campo novo etc.) — linha gravada no formato antigo é refeita.
const VERSAO: Record<AreaGravada, number> = { comercial: 2, 'dre-gerencial': 1, vendedores: 6, maquinas: 1, 'dre-24': 2, posvendas: 2, pecas: 2 }
// Linha mais velha que isso = o robô não está gravando (parado ou código ainda não publicado): refaz na leitura.
const VELHO_MS = 60 * 60_000
// vendedores: conta leve (< 1 s) e a equipe muda (José, 12/11: "entra vendedor no portal, já entra aqui") → 5 min
// José, 16/11 "tudo tem que ficar realtime": Pós (conta < 1 s) refeito por trás a cada 2 min de uso. Comercial (11 s) e
// Peças (7 s) seguem no ritmo do robô (30 min) — as propostas do Comercial já vêm na hora (lerComercial).
const VELHO_AREA: Partial<Record<AreaGravada, number>> = { vendedores: 5 * 60_000, 'dre-24': 6 * 60 * 60_000, posvendas: 2 * 60_000, pecas: 30 * 60_000 }

/** áreas sendo refeitas por trás neste processo (não dispara duas vezes a mesma) */
const refazendo = new Set<AreaGravada>()

const tabelaFalta = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /empresa_painel/.test(e.message || ''))

/** Refaz a conta da área e grava. Devolve os dados e quanto levou. */
export async function recalcular(area: AreaGravada): Promise<{ dados: unknown; calculadoEm: string; ms: number; gravou: boolean }> {
  const t0 = Date.now()
  const dados = { ...(await CALCULO[area]() as object), versao: VERSAO[area] }
  const ms = Date.now() - t0, calculadoEm = new Date().toISOString()
  const { error } = await supabaseAdmin.from('empresa_painel').upsert({ area, dados, calculado_em: calculadoEm, duracao_ms: ms, erro: null }, { onConflict: 'area' })
  if (error && !tabelaFalta(error)) console.warn(`[empresa-painel] gravar ${area}: ${error.message}`)
  return { dados, calculadoEm, ms, gravou: !error }
}

/** "Mudou desde X?" — lê só a hora da conta gravada (consulta leve). Devolve true quando a tela já tem a mesma conta:
 *  a rota responde 204 e a tela não baixa tudo de novo a cada minuto (Peças tem 1,3 MB). Conta velha → refaz por trás. */
export async function areaIgual(area: AreaGravada, desde: string | null): Promise<boolean> {
  if (!desde) return false
  const { data, error } = await supabaseAdmin.from('empresa_painel').select('calculado_em').eq('area', area).maybeSingle()
  if (error || !data?.calculado_em) return false
  const em = String(data.calculado_em)
  if (Date.now() - new Date(em).getTime() > (VELHO_AREA[area] ?? VELHO_MS) && !refazendo.has(area)) {
    refazendo.add(area)
    void recalcular(area).catch(() => {}).finally(() => refazendo.delete(area))
  }
  return new Date(em).getTime() === new Date(desde).getTime()
}

/** Lê a área gravada; sem linha (ou sem tabela) calcula na hora. forcar = "Atualizar agora". */
export async function lerArea(area: AreaGravada, forcar = false): Promise<{ dados: unknown; calculadoEm: string; gravado: boolean }> {
  if (!forcar) {
    const { data, error } = await supabaseAdmin.from('empresa_painel').select('dados,calculado_em').eq('area', area).maybeSingle()
    // formato certo: devolve já. Se estiver velha (robô parado ou código não publicado), refaz POR TRÁS — a tela não espera.
    if (!error && data?.dados && (data.dados as { versao?: number }).versao === VERSAO[area]) {
      if (Date.now() - new Date(String(data.calculado_em)).getTime() > (VELHO_AREA[area] ?? VELHO_MS) && !refazendo.has(area)) {
        refazendo.add(area)
        void recalcular(area).catch(() => {}).finally(() => refazendo.delete(area))
      }
      return { dados: data.dados, calculadoEm: String(data.calculado_em), gravado: true }
    }
  }
  const r = await recalcular(area)
  return { dados: r.dados, calculadoEm: r.calculadoEm, gravado: false }
}

/** Comercial: o grosso vem gravado; as metas vêm sempre na hora. */
export async function lerComercial(forcar = false, desde: string | null = null) {
  // a tela já tem a conta gravada: manda só o que muda na hora (propostas e metas, ~50 KB em vez de 300 KB)
  if (!forcar && (await areaIgual('comercial', desde))) {
    const [m, propostas] = await Promise.all([lerMetas(), montarPropostas()])
    return { ...m, propostas, calculadoEm: desde, parcial: true }
  }
  // propostas sempre na hora (José, 16/11: proposta desatualizada na tela do diretor)
  const [a, m, propostas] = await Promise.all([lerArea('comercial', forcar), lerMetas(), montarPropostas().catch(() => null)])
  return { ...(a.dados as object), ...m, ...(propostas ? { propostas } : {}), calculadoEm: a.calculadoEm }
}

/** Tarefa do agendador: recalcula todas as áreas (ou só a pedida) e resume. */
export async function rodarSnapshotEmpresa(so?: string): Promise<{ resumo: string }> {
  const areas = so && AREAS_GRAVADAS.includes(so as AreaGravada) ? [so as AreaGravada] : AREAS_GRAVADAS
  const partes: string[] = [], erros: string[] = []
  for (const area of areas) {
    try {
      const r = await recalcular(area)
      partes.push(`${area} ${(r.ms / 1000).toFixed(1)}s${r.gravou ? '' : ' (não gravou)'}`)
    } catch (e) {
      const msg = (e as Error).message
      erros.push(`${area}: ${msg}`)
      await supabaseAdmin.from('empresa_painel').update({ erro: msg.slice(0, 500) }).eq('area', area)
    }
  }
  if (erros.length && !partes.length) throw new Error(erros.join(' · '))
  return { resumo: [...partes, ...erros.map((x) => `ERRO ${x}`)].join(' · ') }
}
