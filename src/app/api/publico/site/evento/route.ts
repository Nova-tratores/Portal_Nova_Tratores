// Contador anônimo de acessos do site (aberto, sem login). Recebe 1 evento por chamada (sendBeacon).
// Nada pessoal: código aleatório do aparelho e da visita, página, de onde veio, tempo e cliques.
import { corsSite, lerCorpo, passouLimite, sb } from '@/lib/marketing/redes/server'

export const runtime = 'nodejs'

type Corpo = {
  tipo?: string; visitante?: string; sessao?: string; caminho?: string; titulo?: string; origem?: string
  utm?: string; campanha?: string; aparelho?: string; evento?: string; rotulo?: string; tempo_s?: number; rolou?: number
}
const corta = (s: unknown, n: number) => { const t = String(s ?? '').trim().slice(0, n); return t || null }
const TIPOS = ['pagina', 'clique', 'saida']
const APARELHOS = ['celular', 'tablet', 'computador']

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function POST(req: Request) {
  const cors = corsSite(req)
  const fim = () => new Response(null, { status: 204, headers: cors })
  if (passouLimite(req, 'site-evento', 240, 60_000)) return fim()
  const b = await lerCorpo<Corpo>(req)
  if (!b || !TIPOS.includes(String(b.tipo)) || !b.visitante || !b.sessao || !b.caminho) return fim()
  let origem = corta(b.origem, 300)
  try { if (origem) origem = new URL(origem).host } catch { origem = null } // guarda só o domínio, nunca a URL completa
  const { error } = await sb.from('site_eventos').insert({
    tipo: b.tipo, visitante: corta(b.visitante, 64), sessao: corta(b.sessao, 64), caminho: corta(b.caminho, 200),
    titulo: corta(b.titulo, 120), origem, utm: corta(b.utm, 60), campanha: corta(b.campanha, 80),
    aparelho: APARELHOS.includes(String(b.aparelho)) ? b.aparelho : null,
    evento: corta(b.evento, 60), rotulo: corta(b.rotulo, 80),
    tempo_s: Number.isFinite(b.tempo_s) ? Math.max(0, Math.min(Math.round(b.tempo_s!), 86_400)) : null,
    rolou: Number.isFinite(b.rolou) ? Math.max(0, Math.min(Math.round(b.rolou!), 100)) : null,
  })
  if (error) console.warn('[site/evento]', error.message)
  return fim()
}
