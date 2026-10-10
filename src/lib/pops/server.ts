// POPs — acesso ao banco (service role). SERVER-ONLY: importar só nas rotas
// /api/pops/* e no cron. Regras puras em ./regras (client-safe).
//
// Escrita: sempre por aqui → funções SQL de sql/pops-02-funcoes.sql (só a
// service role executa). Quem pode fazer cada coisa é decidido nas rotas com
// as funções de papel de ./regras + o Ator montado em `atorDe`.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import { filtrarDestinatarios, type PrefsDestinatario } from '@/lib/notif/prefs'
import type { Autenticado } from '@/lib/auth/server'
import { temModuloPops, type Ator, type EstadoVersao, type PopRef } from './regras'

export const BUCKET_MIDIA = 'pops-midia'
export const BUCKET_EXECUCAO = 'pops-execucao'
const URL_VALIDADE_S = 60 * 60 // 1 h

export const MSG_MIGRATION_POPS =
  'O banco do módulo de POPs ainda não foi preparado: rode sql/pops-01-schema.sql e sql/pops-02-funcoes.sql no SQL Editor do Supabase.'

export interface PopRow extends PopRef {
  id: string
  codigo: string
  titulo: string
  eh_template: boolean
  origem_template_id: string | null
  origem_template_versao: number | null
  origem_pop_id: string | null
  periodicidade_revisao_dias: number
  proxima_revisao_em: string | null
  revisado_em: string | null
  arquivado: boolean
  criado_em: string
  atualizado_em: string
}

export interface VersaoRow {
  id: string
  pop_id: string
  numero: number
  estado: EstadoVersao
  objetivo: string
  escopo: string
  materiais: string
  changelog: string
  submetido_por: string | null
  submetido_em: string | null
  revisao_ticket_id: string | null
  aprovado_por: string | null
  aprovado_em: string | null
  publicado_em: string | null
  obsoleto_em: string | null
  criado_em: string
}

// ---------------------------------------------------------------------------
// Respostas HTTP
// ---------------------------------------------------------------------------
export function erro(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: msg, ...extra }, { status })
}

// Erro vindo do banco → resposta. Regra do POP (RAISE 'POP: ...' / triggers) = 400;
// conflito de unicidade = 409; migration faltando = 503; resto = 500.
export function erroBanco(e: unknown) {
  const err = e as { code?: string; message?: string } | null
  if (migrationFaltou(err)) return erro(MSG_MIGRATION_POPS, 503, { migracaoFaltando: true })
  const m = String(err?.message || 'Erro no banco')
  if (m.startsWith('POP:')) return erro(m.slice(4).trim(), err?.code === '23001' ? 409 : 400)
  if (err?.code === '23505') return erro('Já existe um registro igual (conflito).', 409)
  if (err?.code === '23514' || err?.code === '23503') return erro(m, 400)
  console.error('[pops] erro do banco:', err)
  return erro('Erro interno no módulo de POPs.', 500)
}

// supabase.rpc com erro lançado (para usar com try/catch → erroBanco).
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(fn, args)
  if (error) throw error
  return data as T
}

// ---------------------------------------------------------------------------
// Ator = sessão + papéis por área (uma ida ao banco)
// ---------------------------------------------------------------------------
export async function atorDe(auth: Autenticado): Promise<Ator> {
  const { data, error } = await supabaseAdmin
    .from('pops_area_papeis').select('area_id, papel').eq('user_id', auth.userId)
  if (error && !migrationFaltou(error)) throw error
  return {
    userId: auth.userId,
    isAdmin: auth.isAdmin,
    modulos: auth.modulos,
    papeisArea: (data || []) as Ator['papeisArea'],
  }
}

export { temModuloPops }

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
export async function carregarPop(id: string): Promise<PopRow | null> {
  const { data, error } = await supabaseAdmin.from('pops').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as PopRow | null
}

export async function carregarVersao(id: string): Promise<VersaoRow | null> {
  const { data, error } = await supabaseAdmin.from('pops_versoes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as VersaoRow | null
}

export async function versoesDoPop(popId: string): Promise<VersaoRow[]> {
  const { data, error } = await supabaseAdmin.from('pops_versoes').select('*')
    .eq('pop_id', popId).order('numero', { ascending: false })
  if (error) throw error
  return (data || []) as VersaoRow[]
}

export async function passosDaVersao(versaoId: string) {
  const { data, error } = await supabaseAdmin.from('pops_passos').select('*')
    .eq('versao_id', versaoId).order('ordem', { ascending: true })
  if (error) throw error
  return data || []
}

export async function usuariosMin(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  if (!unicos.length) return {} as Record<string, { id: string; nome: string; avatar_url: string | null }>
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', unicos)
  const mapa: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of data || []) mapa[u.id] = u
  return mapa
}

export async function usuarioAtivo(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, ativo').eq('id', id).maybeSingle()
  return !!data && data.ativo !== false
}

// Aprovadores da área (para escolher a "bola" da revisão).
export async function aprovadoresDaArea(areaId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('pops_area_papeis').select('user_id')
    .eq('area_id', areaId).eq('papel', 'aprovador').order('user_id')
  return (data || []).map((r) => r.user_id as string)
}

// ---------------------------------------------------------------------------
// Storage privado — upload e leitura SEMPRE por URL assinada
// ---------------------------------------------------------------------------
export async function urlsAssinadas(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(paths.filter(Boolean))]
  if (!unicos.length) return {}
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(unicos, URL_VALIDADE_S)
  if (error) { console.error('[pops] signed urls:', error.message); return {} }
  const out: Record<string, string> = {}
  for (const d of data || []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
}

// Devolve { path, token, signedUrl } para o navegador subir direto no bucket.
export async function urlDeUpload(bucket: string, pasta: string, contentType: string) {
  const ext = EXTENSOES[contentType]
  if (!ext) throw Object.assign(new Error('POP: tipo de arquivo não aceito.'), { code: 'P0001' })
  if (bucket === BUCKET_EXECUCAO && !contentType.startsWith('image/')) {
    throw Object.assign(new Error('POP: na execução só entra foto.'), { code: 'P0001' })
  }
  const path = `${pasta}/${crypto.randomUUID()}.${ext}`
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data) throw error || new Error('Falha ao gerar URL de upload')
  return { path, token: data.token, signedUrl: data.signedUrl }
}

// ---------------------------------------------------------------------------
// Aviso no sino fora de ticket (ex.: ciência exigida). Respeita o silenciamento
// do módulo 'tickets' (Central de Trabalho), como notificarTicket.
// ---------------------------------------------------------------------------
export async function notificarUsuarios(ids: string[], autorId: string | null, titulo: string, descricao: string, link: string) {
  const alvo = [...new Set(ids)].filter((u) => u && u !== autorId)
  if (!alvo.length) return
  const { data: prefs } = await supabaseAdmin.from('portal_permissoes')
    .select('user_id, categoria, notif_silenciado').in('user_id', alvo)
  const ok = new Set(filtrarDestinatarios('tickets', (prefs || []) as PrefsDestinatario[]))
  const comLinha = new Set((prefs || []).map((p: { user_id: string }) => p.user_id))
  const finais = alvo.filter((u) => !comLinha.has(u) || ok.has(u))
  if (!finais.length) return
  await supabaseAdmin.from('portal_notificacoes').insert(
    finais.map((user_id) => ({ user_id, tipo: 'tickets', titulo, descricao, link })))
}

// O usuário é admin do módulo de POPs? (para escolher aprovador de modelo do sistema)
export async function usuarioEhAdminPops(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('portal_permissoes')
    .select('is_admin, is_dev, modulos_permitidos').eq('user_id', userId).maybeSingle()
  const mods: string[] = data?.modulos_permitidos || []
  return !!data && (data.is_admin === true || data.is_dev === true || mods.includes('pops') || mods.includes('pops:admin'))
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
export async function carregarExecucao(ticketId: string) {
  const { data, error } = await supabaseAdmin.from('pops_execucoes').select('*').eq('ticket_id', ticketId).maybeSingle()
  if (error) throw error
  return data as {
    ticket_id: string; pop_id: string; versao_id: string; agendamento_id: string | null
    data_referencia: string | null; ref_externa: string | null; criado_em: string
  } | null
}

export async function respostasDaExecucao(ticketId: string) {
  const { data, error } = await supabaseAdmin.from('pops_execucao_respostas').select('*')
    .eq('ticket_id', ticketId).order('respondido_em', { ascending: true })
  if (error) throw error
  return data || []
}
