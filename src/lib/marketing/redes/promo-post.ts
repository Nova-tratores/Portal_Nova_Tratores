// =============================================================================
// Promoção → post nas redes em 1 clique (25/11/2026, José: "a aba promoções tem que fazer posts para todos os
// meios de comunicação"). Ao gravar uma promoção que tem arte para as redes, o servidor cria o post dela no
// calendário, marcado para Instagram, Facebook, TikTok e YouTube, com a arte e o texto da promoção.
// Se o post da promoção já existe e ainda não saiu, ele é atualizado (arte e texto novos); se já saiu, fica como está.
// O post nasce como "ideia": antes de sair, a pessoa confere, marca as etiquetas e (por ser preço) pede aprovação.
// =============================================================================
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { RedeId } from './redes'

const SOCIAIS: RedeId[] = ['instagram', 'facebook', 'tiktok', 'youtube']
type Promo = {
  id: string; titulo: string; texto?: string | null; legenda?: string | null; inicio?: string | null
  arte_feed?: string | null; arte_vertical?: string | null; video?: string | null; redes?: string[] | null
}
export type PostDaPromo = { id: string; criado: boolean } | { pulado: string }

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export async function postDaPromocao(p: Promo, por: string): Promise<PostDaPromo> {
  if (!p.arte_feed && !p.arte_vertical && !p.video) return { pulado: 'sem arte para as redes' }
  // o post vai para as redes sociais marcadas na promoção; sem nenhuma marcada, vai para todas
  const marcadas = (p.redes || []).filter((x): x is RedeId => SOCIAIS.includes(x as RedeId))
  const redes = marcadas.length ? marcadas : SOCIAIS
  const midia = Object.fromEntries(Object.entries({ feed: p.arte_feed, vertical: p.arte_vertical, video: p.video }).filter(([, u]) => !!u))
  const legenda = (p.legenda || [p.titulo, p.texto].filter(Boolean).join('\n')).slice(0, 5000)

  const { data: ja } = await sb.from('site_posts').select('id, resultado').eq('promocao_id', p.id).order('criado_em').limit(1).maybeSingle()
  if (ja) {
    const saiu = Object.values((ja.resultado as Record<string, { ok?: boolean }> | null) || {}).some((x) => x?.ok)
    if (saiu) return { pulado: 'o post da promoção já saiu' }
    await sb.from('site_posts').update({ titulo: p.titulo.slice(0, 120), legenda, midia, redes, atualizado_em: new Date().toISOString(), atualizado_por: por }).eq('id', ja.id)
    return { id: String(ja.id), criado: false }
  }

  // dia de postar: o começo da promoção (ou amanhã, se ela já começou), às 9h
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const dia = p.inicio && p.inicio > hojeSP() ? p.inicio : amanha
  const base = {
    titulo: p.titulo.slice(0, 120), legenda, redes, midia, formato: p.video ? 'reels' : 'feed', quando: new Date(`${dia}T09:00:00-03:00`).toISOString(),
    status: 'ideia', promocao_id: p.id, resultado: {}, notas: 'Criado sozinho a partir da promoção. Confira o texto, marque as etiquetas e peça a aprovação antes de postar.',
    criado_por: por, atualizado_por: por,
  }
  let r = await sb.from('site_posts').insert({ ...base, etiqueta_tipo: 'promocao' }).select('id').single()
  if (r.error && /etiqueta_tipo/.test(r.error.message)) r = await sb.from('site_posts').insert(base).select('id').single()   // SQL da Fase 4 ainda não rodou
  if (r.error) throw new Error(r.error.message)
  return { id: String(r.data.id), criado: true }
}
