// Recibos de pagamento — SÓ SERVIDOR (service role). Tabela e funções: sql/recibos.sql.
import { randomBytes } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { omie } from '@/lib/omie/porta'
import { contaOmie } from '@/lib/omie/contas'
import { lerAssinatura } from '@/lib/assinaturas/server'
import { lancarReciboNoOmie } from './omie'
import type { DadosRecibo, EmpresaRecibo, EscolhaOmie, Recibo } from './tipos'

export const SEM_TABELA = 'Falta rodar o SQL sql/recibos.sql no Supabase do portal (projeto citrhumdkf…).'
export const SEM_OMIE = 'Falta rodar o SQL sql/recibos-omie.sql no Supabase do portal (projeto citrhumdkf…).'
const falta = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42P01' || e.code === '42883' || /does not exist|could not find/i.test(e.message || ''))
const erro = (e: { code?: string; message?: string }) => new Error(falta(e) ? SEM_TABELA : e.message)

// ── empresa emitente ───────────────────────────────────────────────────────────
const cacheEmpresa = new Map<string, { em: number; v: EmpresaRecibo }>()

export async function dadosEmpresa(nome: string): Promise<EmpresaRecibo> {
  const c = cacheEmpresa.get(nome)
  if (c && Date.now() - c.em < 6 * 3600_000) return c.v
  let v: EmpresaRecibo = { nome, razao_social: nome }
  if (nome === 'Nova Tratores') {
    // mesmos dados do PDF das Propostas
    const { data } = await sb.from('Configuracoes').select('razao_social, cnpj, ie, endereco, telefone').eq('id', 1).maybeSingle()
    if (data) v = { nome, ...(data as Omit<EmpresaRecibo, 'nome'>), razao_social: (data as { razao_social?: string }).razao_social || nome }
  } else {
    try {
      const conta = contaOmie(nome)
      const j = await omie<{ empresas_cadastro?: Record<string, string>[] }>(
        { appKey: conta.key, appSecret: conta.secret, rotulo: nome },
        'geral/empresas/', 'ListarEmpresas', { pagina: 1, registros_por_pagina: 5 },
        { prioridade: 'pessoa', timeoutMs: 15_000, tentativas: 0 },
      )
      const e = j.empresas_cadastro?.[0]
      if (e) v = {
        nome, razao_social: e.razao_social || nome, cnpj: e.cnpj || null, ie: e.inscricao_estadual || null,
        endereco: [[e.endereco, e.endereco_numero].filter(Boolean).join(', '), e.bairro, [e.cidade, e.estado].filter(Boolean).join(' - '), e.cep]
          .filter(Boolean).join(' · ') || null,
        telefone: e.telefone1_numero ? `(${e.telefone1_ddd || ''}) ${e.telefone1_numero}` : null,
      }
    } catch { /* sem Omie: sai só o nome; não guarda no cache para tentar de novo */ return v }
  }
  cacheEmpresa.set(nome, { em: Date.now(), v })
  return v
}

// ── quem emite ─────────────────────────────────────────────────────────────────
export async function nomeUsuario(userId: string): Promise<string | null> {
  const { data } = await sb.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return (data as { nome?: string } | null)?.nome || null
}

/** PNG (data URL) da assinatura salva de quem emitiu; null se não tiver. */
export async function assinaturaDe(userId: string | null): Promise<string | null> {
  if (!userId) return null
  try { return (await lerAssinatura(userId))?.imagem || null } catch { return null }
}

// ── banco ──────────────────────────────────────────────────────────────────────
export async function emitirRecibo(d: DadosRecibo, userId: string, nome: string | null): Promise<Recibo> {
  const token = randomBytes(12).toString('base64url')
  const { data, error } = await sb.rpc('recibo_emitir', {
    p: { ...d, token, emitido_por: userId, emitido_nome: nome, assina_nome: d.tipo === 'recebemos' ? nome : null },
  })
  if (error) throw erro(error)
  return data as Recibo
}

/** Confere antes de emitir se o SQL do Omie já rodou (para não emitir um recibo que não consegue ir ao Omie). */
export async function conferirColunasOmie(): Promise<void> {
  const { error } = await sb.from('recibos').select('omie_lancar').limit(1)
  if (error) throw new Error(falta(error) || error.code === '42703' ? SEM_OMIE : error.message)
}

/** Guarda a escolha de categoria/conta no recibo (o lançamento em si é feito por lancarOmie). */
export async function guardarEscolhaOmie(id: number, e: EscolhaOmie): Promise<Recibo> {
  const { data, error } = await sb.from('recibos').update({
    omie_lancar: true, omie_categoria: e.categoria, omie_categoria_nome: e.categoria_nome || null,
    omie_conta_corrente: e.conta, omie_conta_nome: e.conta_nome || null,
  }).eq('id', id).select('*').single()
  if (error) throw new Error(falta(error) ? SEM_OMIE : error.message)
  return data as Recibo
}

/** Lança (ou relança) no Omie e grava o resultado no recibo. Nunca lança erro: devolve o recibo com omie_erro. */
export async function lancarOmie(r: Recibo): Promise<Recibo> {
  let campos: Record<string, unknown>
  try {
    const { codigo } = await lancarReciboNoOmie(r)
    campos = { omie_codigo_lancamento: codigo, omie_baixado_em: new Date().toISOString(), omie_erro: null }
  } catch (e) {
    campos = { omie_erro: String((e as Error)?.message || e).slice(0, 500) }
  }
  const { data } = await sb.from('recibos').update(campos).eq('id', r.id).select('*').single()
  return (data as Recibo) || { ...r, ...campos }
}

export async function listarRecibos(f: { busca?: string; limite?: number; origem_tipo?: string; origem_id?: string }): Promise<Recibo[]> {
  let q = sb.from('recibos').select('*').order('criado_em', { ascending: false }).limit(Math.min(f.limite || 200, 500))
  if (f.origem_tipo && f.origem_id) q = q.eq('origem_tipo', f.origem_tipo).eq('origem_id', f.origem_id)
  const busca = (f.busca || '').replace(/[%,()*]/g, ' ').trim()
  if (busca) {
    const n = Number(busca.replace(/\D/g, ''))
    q = /^\d+$/.test(busca) && n
      ? q.or(`numero.eq.${n},pessoa_doc.ilike.%${busca}%`)
      : q.or(`pessoa_nome.ilike.%${busca}%,referente.ilike.%${busca}%`)
  }
  const { data, error } = await q
  if (error) throw erro(error)
  return (data || []) as Recibo[]
}

export async function buscarRecibo(id: number): Promise<Recibo | null> {
  const { data, error } = await sb.from('recibos').select('*').eq('id', id).maybeSingle()
  if (error) throw erro(error)
  return data as Recibo | null
}

export async function buscarPorToken(token: string): Promise<Recibo | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null
  const { data, error } = await sb.from('recibos').select('*').eq('token', token).maybeSingle()
  if (error) return null
  return data as Recibo | null
}

export async function cancelarRecibo(id: number, motivo: string, por: string): Promise<Recibo> {
  const { data, error } = await sb.from('recibos')
    .update({ cancelado_em: new Date().toISOString(), cancelado_por: por, cancelado_motivo: motivo })
    .eq('id', id).is('cancelado_em', null).select('*').maybeSingle()
  if (error) throw erro(error)
  if (!data) throw new Error('Recibo não encontrado ou já cancelado')
  return data as Recibo
}
