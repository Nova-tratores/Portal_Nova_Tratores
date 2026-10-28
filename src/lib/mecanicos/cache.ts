// Cache do Centro do Pós-Vendas em tabela (posvendas_painel_cache, sql/posvendas-painel-cache.sql)
// + cópia em memória do processo (a mais rápida). Regra: devolve SEMPRE o que está gravado (na
// hora). Se passou da validade, recalcula em segundo plano e regrava — quem abrir depois já pega o
// novo. Sem nada gravado (1ª vez), calcula e espera. `forcar` recalcula na hora.
// Sem a tabela (migration pendente), fica só a memória.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

const TABELA = 'posvendas_painel_cache'
const MAX_MEMORIA = 60
const emAndamento = new Map<string, Promise<unknown>>()
const memoria = new Map<string, { dados: unknown; geradoEm: string }>()
let semTabela = false

export interface ComCache<T> { dados: T; geradoEm: string; deCache: boolean }

const tabelaFalta = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''))

function lembrar(chave: string, dados: unknown, geradoEm: string) {
  memoria.delete(chave)
  memoria.set(chave, { dados, geradoEm })
  while (memoria.size > MAX_MEMORIA) memoria.delete(memoria.keys().next().value as string)
}

async function gravar(chave: string, dados: unknown) {
  const geradoEm = new Date().toISOString()
  lembrar(chave, dados, geradoEm)
  if (semTabela) return
  const { error } = await sb.from(TABELA).upsert({ chave, dados, gerado_em: geradoEm })
  if (tabelaFalta(error)) semTabela = true
  else if (error) console.error('[pos-cache] gravar', chave, error.message)
}

/** Calcula uma vez por chave ao mesmo tempo (duas telas abertas não calculam em dobro). */
function calcular<T>(chave: string, gerar: () => Promise<T>): Promise<T> {
  const atual = emAndamento.get(chave) as Promise<T> | undefined
  if (atual) return atual
  const p = gerar().then(async (d) => { await gravar(chave, d); return d }).finally(() => emAndamento.delete(chave))
  emAndamento.set(chave, p)
  return p
}

export async function comCache<T>(chave: string, validadeMs: number, gerar: () => Promise<T>, forcar = false): Promise<ComCache<T>> {
  if (!forcar) {
    let achado = memoria.get(chave) as { dados: T; geradoEm: string } | undefined
    if (!achado && !semTabela) {
      const { data, error } = await sb.from(TABELA).select('dados, gerado_em').eq('chave', chave).maybeSingle()
      if (tabelaFalta(error)) semTabela = true
      if (data) { achado = { dados: data.dados as T, geradoEm: data.gerado_em }; lembrar(chave, achado.dados, achado.geradoEm) }
    }
    if (achado) {
      if (Date.now() - Date.parse(achado.geradoEm) > validadeMs) calcular(chave, gerar).catch((e) => console.error('[pos-cache] recalcular', chave, e))
      return { dados: achado.dados, geradoEm: achado.geradoEm, deCache: true }
    }
  }
  const dados = await calcular(chave, gerar)
  return { dados, geradoEm: memoria.get(chave)?.geradoEm || new Date().toISOString(), deCache: false }
}

/** Recalcula por trás se estiver velho ou faltando (para o robô deixar tudo pronto antes de alguém abrir). */
export async function aquecer<T>(chave: string, validadeMs: number, gerar: () => Promise<T>) {
  await comCache(chave, validadeMs, gerar)
  const p = emAndamento.get(chave)
  if (p) await p
}

/** Esquece (memória + tabela) as chaves que começam com algum dos prefixos — a próxima leitura recalcula.
 *  Usado quando entra faturamento/ocorrência e a tela precisa do dado novo na hora (ao-vivo-server.ts). */
export async function esquecer(prefixos: string[]) {
  for (const k of [...memoria.keys()]) if (prefixos.some((p) => k.startsWith(p))) memoria.delete(k)
  if (semTabela) return
  for (const p of prefixos) {
    const { error } = await sb.from(TABELA).delete().like('chave', `${p}%`)
    if (tabelaFalta(error)) { semTabela = true; return }
  }
}
