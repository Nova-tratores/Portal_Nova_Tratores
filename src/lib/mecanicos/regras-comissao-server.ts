// Leitura/gravação das regras editáveis da comissão — SÓ SERVIDOR.
// Mora em posvendas_config (sql/posvendas-config.sql); enquanto a tabela não existir, usa iv_config (mesmo
// formato chave/valor, já criada) com a chave "posvendas:regras-comissao". Sem nada gravado = REGRAS_PADRAO.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { REGRAS_PADRAO, validarRegras, type RegrasComissao } from './regras-comissao'

const CHAVE = 'regras-comissao'
const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''))
let cache: { r: RegrasComissao; em: number } | null = null

export async function lerRegrasComissao(): Promise<RegrasComissao> {
  if (cache && Date.now() - cache.em < 60_000) return cache.r
  let linha: { valor: unknown; atualizado_em: string | null; atualizado_por: string | null } | null = null
  const a = await sb.from('posvendas_config').select('valor, atualizado_em, atualizado_por').eq('chave', CHAVE).maybeSingle()
  if (!a.error) linha = a.data
  if (!linha && (a.error ? falta(a.error) : true)) {
    const b = await sb.from('iv_config').select('valor, atualizado_em, atualizado_por').eq('chave', `posvendas:${CHAVE}`).maybeSingle()
    if (!b.error) linha = b.data
  }
  const r: RegrasComissao = linha ? { ...validarRegras(linha.valor), atualizadoEm: linha.atualizado_em, atualizadoPor: linha.atualizado_por } : REGRAS_PADRAO
  cache = { r, em: Date.now() }
  return r
}

export async function gravarRegrasComissao(entrada: unknown, autor: string): Promise<RegrasComissao> {
  const valor = validarRegras(entrada)
  const reg = { valor, atualizado_em: new Date().toISOString(), atualizado_por: autor }
  const a = await sb.from('posvendas_config').upsert({ chave: CHAVE, ...reg })
  if (a.error) {
    if (!falta(a.error)) throw new Error(a.error.message)
    const b = await sb.from('iv_config').upsert({ chave: `posvendas:${CHAVE}`, ...reg })
    if (b.error) throw new Error(b.error.message)
  }
  cache = null
  return { ...valor, atualizadoEm: reg.atualizado_em, atualizadoPor: autor }
}
