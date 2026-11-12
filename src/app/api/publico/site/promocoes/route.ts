// Promoções ativas da página inicial (aberto, sem login), lidas pelo SITE no build. Só as ligadas e dentro da data;
// o site também esconde no navegador a que vencer depois do build. Sem promoção, o site não mostra o bloco.
import { NextResponse } from 'next/server'
import { corsSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function GET(req: Request) {
  const cors = corsSite(req)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data, error } = await sb.from('site_promocoes')
    .select('*') // * para funcionar com ou sem a coluna imagem_celular (12/11)
    .eq('ativo', true).order('ordem').order('criado_em')
  if (error) return NextResponse.json({ promocoes: [] }, { headers: cors })
  // fim no futuro (ou sem fim); início pode ser futuro: o site mostra a partir do dia. Só campos públicos.
  const promocoes = ((data || []) as Record<string, unknown>[]).filter((p) => !p.fim || String(p.fim) >= hoje)
    .map(({ id, titulo, texto, imagem, imagem_celular, produto_slug, link, botao, inicio, fim }) =>
      ({ id, titulo, texto, imagem, imagem_celular: imagem_celular ?? null, produto_slug, link, botao, inicio, fim }))
  return NextResponse.json({ promocoes }, { headers: cors })
}
