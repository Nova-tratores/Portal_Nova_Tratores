// Base inteira do Centro do Pós-Vendas (4 anos: OS faturadas, horas do app, OS internas) gravada
// em posvendas_painel_cache, mais os gastos (abastecimento e alimentação). A tela baixa UMA vez e calcula qualquer dia/semana/mês/ano na hora
// (montarPainel em ./painel.ts). Recalculada por trás a cada 10 min; o robô a deixa sempre pronta.
import { carregarBase } from './painel-server'
import { comCache, aquecer } from './cache'
import { carregarGastos } from './gastos-server'
import { padronizadorOcorrencias } from './ocorrencias-server'
import type { BaseDados } from './painel'

export const CHAVE_BASE = 'base4'
export const VALIDADE_BASE_MS = 10 * 60_000
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function montar(): Promise<BaseDados & { de: string; ate: string }> {
  const ate = hojeSP()
  const de = `${Number(ate.slice(0, 4)) - 3}-01-01`
  const { padronizar } = await padronizadorOcorrencias()
  const [b, gastos] = await Promise.all([carregarBase(de, ate), carregarGastos(de, ate, padronizar)])
  return { de, ate, tecnicos: b.tecnicos, faturadas: b.faturadas, diasTodos: b.diasTodos.filter((d) => d.data >= de), osInternas: b.osInternas, gastos }
}

export const baseComCache = (forcar = false) => comCache(CHAVE_BASE, VALIDADE_BASE_MS, montar, forcar)
export const aquecerBase = () => aquecer(CHAVE_BASE, VALIDADE_BASE_MS, montar)
