// Base inteira do Centro do Pós-Vendas (4 anos: OS faturadas, horas do app, OS internas, gastos e
// salários). A tela baixa UMA vez e calcula qualquer dia/semana/mês/ano na hora (montarPainel).
// Fonte: as TABELAS posvendas_* (tabelas-server.ts), regravadas pelo robô — a cada 10 min os
// últimos 90 dias e 1x por dia os 4 anos. Sem as tabelas, calcula nas fontes e guarda no cache.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarBase } from './painel-server'
import { comCache, aquecer } from './cache'
import { carregarGastos, carregarEquipe, carregarPctComissao } from './gastos-server'
import { carregarPendencias, idsGarantia, numsComNota } from './pendencias-server'
import { padronizadorOcorrencias } from './ocorrencias-server'
import { lerBaseDasTabelas, sincronizarPosVendas, anoInicialBase, TabelasFaltando } from './tabelas-server'
import { somarDias, type BaseDados } from './painel'

type BaseTela = BaseDados & { de: string; ate: string; geradoEm: string }
export const CHAVE_BASE = 'base4'
export const VALIDADE_BASE_MS = 10 * 60_000
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

// cópia em memória da leitura das tabelas (várias telas abertas não releem o banco a cada clique)
let memoria: { base: BaseTela; em: number } | null = null
let semTabelas = false
let renovando: Promise<void> | null = null

/** Sem as tabelas: calcula direto nas fontes (como antes). */
async function montarNasFontes(): Promise<BaseTela> {
  const ate = hojeSP(), de = anoInicialBase()
  const { padronizar } = await padronizadorOcorrencias()
  const b = await carregarBase(de, ate)
  const tecnicos = new Set([...b.tecnicos, ...b.diasTodos.map((d) => d.tecnico), ...b.faturadas.flatMap((o) => o.tecnicos)])
  const [gastos, equipe, pendencias, garantias, comNota] = await Promise.all([
    carregarGastos(de, ate, padronizar, tecnicos), carregarEquipe(padronizar, tecnicos),
    carregarPendencias(new Set(b.faturadas.map((o) => o.os)), padronizar).catch(() => []),
    idsGarantia().catch(() => new Set<string>()),
    numsComNota().catch(() => new Set<string>()),
  ])
  return { de, ate, geradoEm: new Date().toISOString(), tecnicos: b.tecnicos, faturadas: b.faturadas.map((o) => ({ ...o, garantia: garantias.has(o.os), nota: !!o.numeroOmie && comNota.has(o.numeroOmie) })), diasTodos: b.diasTodos.filter((d) => d.data >= de), osInternas: b.osInternas, internasFechadas: b.internasFechadas, gastos, equipe, pendencias, pctComissao: await carregarPctComissao(padronizar, tecnicos).catch(() => ({})) }
}

export async function baseComCache(forcar = false): Promise<{ dados: BaseTela; geradoEm: string }> {
  if (!semTabelas) {
    // responde na hora com a cópia em memória (até 10 min) e renova por trás depois de 1 min
    if (!forcar && memoria && Date.now() - memoria.em < VALIDADE_BASE_MS) {
      if (Date.now() - memoria.em > 60_000 && !renovando) {
        renovando = lerBaseDasTabelas().then((b) => { if (b) memoria = { base: b, em: Date.now() } }).catch(() => {}).finally(() => { renovando = null })
      }
      return { dados: memoria.base, geradoEm: memoria.base.geradoEm }
    }
    try {
      if (forcar) await sincronizarPosVendas(somarDias(hojeSP(), -90), hojeSP())
      const b = await lerBaseDasTabelas()
      if (b) { memoria = { base: b, em: Date.now() }; return { dados: b, geradoEm: b.geradoEm } }
      // tabelas vazias: a 1ª carga completa (4 anos) e lê de novo
      await sincronizarPosVendas(anoInicialBase(), hojeSP())
      const b2 = await lerBaseDasTabelas()
      if (b2) { memoria = { base: b2, em: Date.now() }; return { dados: b2, geradoEm: b2.geradoEm } }
    } catch (e) {
      if (e instanceof TabelasFaltando) semTabelas = true
      else throw e
    }
  }
  const r = await comCache(CHAVE_BASE, VALIDADE_BASE_MS, montarNasFontes, forcar)
  return { dados: r.dados, geradoEm: r.geradoEm }
}

// robô: últimos 90 dias a cada rodada; os 4 anos uma vez por dia (depois das 3 h)
let ultimaCompleta = ''
export async function aquecerBase() {
  if (semTabelas) return aquecer(CHAVE_BASE, VALIDADE_BASE_MS, montarNasFontes)
  const hoje = hojeSP()
  try {
    const { count } = await sb.from('posvendas_os').select('os', { count: 'exact', head: true })
    const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()))
    const completa = !count || (ultimaCompleta !== hoje && hora >= 3)
    const r = await sincronizarPosVendas(completa ? anoInicialBase() : somarDias(hoje, -90), hoje)
    if (completa) ultimaCompleta = hoje
    memoria = null
    return r
  } catch (e) {
    if (e instanceof TabelasFaltando) { semTabelas = true; return aquecer(CHAVE_BASE, VALIDADE_BASE_MS, montarNasFontes) }
    throw e
  }
}
