// Ocorrências dos técnicos (tecnico_ocorrencias) — leitura no banco para o Radar e a análise do Tratorilson.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { padronizador } from './painel-server'
import { paraOcorrencia, casarNome, nomeInvalido, type OcorrenciaPainel } from './ocorrencias-painel'

export const COLS_OCORRENCIA = 'id, tecnico_nome, id_ordem, tipo, categoria, subcategoria, descricao, data, pontos_descontados, origem, anexos, detalhes, criado_por, tecnico_justificativas(id, justificativa, status, descontar_comissao, avaliado_por, data_avaliacao, anexos, created_at)'

/** Nome de exibição: o do cadastro; grafias da mesma pessoa ("DOUGRAS BOMFIM") viram uma só. */
export async function padronizadorOcorrencias() {
  const { tecnicos, padronizar: padrao, pessoas } = await padronizador()
  const padronizar = (n: unknown) => {
    const bruto = String(n ?? '').trim()
    if (nomeInvalido(bruto)) return 'Sem nome'
    const s = padrao(bruto)
    return pessoas.includes(s) ? s : casarNome(bruto, pessoas) || s
  }
  return { tecnicos, padronizar }
}

/** Ocorrências entre `de` e `ate` (YYYY-MM-DD), mais recentes primeiro. */
export async function ocorrenciasEntre(de: string, ate: string, padronizar: (n: unknown) => string): Promise<OcorrenciaPainel[]> {
  const r = await sb.from('tecnico_ocorrencias').select(COLS_OCORRENCIA).gte('data', de).lte('data', ate).order('data', { ascending: false }).limit(3000)
  if (r.error) throw new Error(r.error.message)
  return (r.data || []).map((o) => paraOcorrencia(o as Record<string, unknown>, padronizar))
}
