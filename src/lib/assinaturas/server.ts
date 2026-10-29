// Assinatura salva de cada pessoa do portal (José, 29/10/2026) — SÓ SERVIDOR.
// Quem pede a comissão (gerente) e quem autoriza (diretor) usam a assinatura salva em vez de desenhar toda vez.
// Fonte: portal_assinaturas (sql/portal-assinaturas.sql). Sem linha lá, a do vendedor nas Propostas (vendedores.
// assinatura_url, ex.: a rubrica do Dougras) vale pelo nome.
import { randomBytes } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { casarNome } from '@/lib/mecanicos/ocorrencias-painel'

export interface AssinaturaSalva { imagem: string; origem: 'admin' | 'link' | 'proposta'; em: string | null }
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''))
export const SEM_TABELA = 'Falta rodar o SQL sql/portal-assinaturas.sql no Supabase do portal.'

export function validarPng(png: unknown): string {
  const s = String(png || '')
  if (!PNG.test(s)) throw new Error('Assinatura inválida')
  if (s.length > 400_000) throw new Error('Assinatura grande demais — limpe e assine de novo')
  return s
}

/** A assinatura do vendedor nas Propostas (pelo nome da pessoa), virada em PNG data URL. */
async function daProposta(userId: string): Promise<AssinaturaSalva | null> {
  const { data: u } = await sb.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  const nome = String((u as { nome?: string } | null)?.nome || '')
  if (!nome) return null
  const { data: vs } = await sb.from('vendedores').select('nome, assinatura_url').not('assinatura_url', 'is', null)
  const lista = ((vs || []) as { nome: string; assinatura_url: string }[]).filter((v) => !/teste/i.test(v.nome))
  const v = lista.find((x) => casarNome(x.nome, [nome]) || casarNome(nome, [x.nome]))
  if (!v) return null
  try {
    const r = await fetch(v.assinatura_url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 280_000 || buf.subarray(0, 4).toString('hex') !== '89504e47') return null // só PNG pequeno
    return { imagem: `data:image/png;base64,${buf.toString('base64')}`, origem: 'proposta', em: null }
  } catch { return null }
}

export async function lerAssinatura(userId: string): Promise<AssinaturaSalva | null> {
  const { data, error } = await sb.from('portal_assinaturas').select('imagem, origem, atualizado_em').eq('user_id', userId).maybeSingle()
  if (error && !falta(error)) throw new Error(error.message)
  const l = data as { imagem: string; origem: string; atualizado_em: string } | null
  if (l?.imagem) return { imagem: l.imagem, origem: l.origem === 'link' ? 'link' : 'admin', em: l.atualizado_em }
  return daProposta(userId)
}

export async function gravarAssinatura(userId: string, png: unknown, origem: 'admin' | 'link', por: string | null) {
  const imagem = validarPng(png)
  const { error } = await sb.from('portal_assinaturas').upsert({ user_id: userId, imagem, origem, atualizado_em: new Date().toISOString(), atualizado_por: por })
  if (error) throw new Error(falta(error) ? SEM_TABELA : error.message)
}

export async function apagarAssinatura(userId: string) {
  const { error } = await sb.from('portal_assinaturas').delete().eq('user_id', userId)
  if (error && !falta(error)) throw new Error(error.message)
}

/** Link único (7 dias) para a pessoa assinar pelo celular. */
export async function criarLink(userId: string, por: string | null): Promise<string> {
  const token = randomBytes(18).toString('base64url')
  const { error } = await sb.from('portal_assinatura_links').insert({ token, user_id: userId, criado_por: por, expira_em: new Date(Date.now() + 7 * 864e5).toISOString() })
  if (error) throw new Error(falta(error) ? SEM_TABELA : error.message)
  return token
}

export async function lerLink(token: string): Promise<{ userId: string; nome: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null
  const { data } = await sb.from('portal_assinatura_links').select('user_id, expira_em, usado_em').eq('token', token).maybeSingle()
  const l = data as { user_id: string; expira_em: string; usado_em: string | null } | null
  if (!l || l.usado_em || new Date(l.expira_em) < new Date()) return null
  const { data: u } = await sb.from('financeiro_usu').select('nome').eq('id', l.user_id).maybeSingle()
  return { userId: l.user_id, nome: String((u as { nome?: string } | null)?.nome || '') }
}

export async function assinarPeloLink(token: string, png: unknown) {
  const l = await lerLink(token)
  if (!l) throw new Error('Link vencido ou já usado. Peça um novo.')
  await gravarAssinatura(l.userId, png, 'link', `link (${l.nome})`)
  await sb.from('portal_assinatura_links').update({ usado_em: new Date().toISOString() }).eq('token', token)
}
