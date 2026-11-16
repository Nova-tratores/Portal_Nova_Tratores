// Conteúdo editado no portal, lido pelo SITE na hora de gerar as páginas (build). Aberto, sem login: só texto público
// (telefones, horário, textos de banner, aviso). Quem mudou e o histórico não saem daqui.
import { NextResponse } from 'next/server'
import { corsSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function GET(req: Request) {
  const cors = corsSite(req)
  const { data, error } = await sb.from('site_conteudo').select('grupo, valor')
  if (error) return NextResponse.json({ conteudo: {} }, { headers: cors })
  const conteudo: Record<string, unknown> = {}
  for (const l of (data || []) as { grupo: string; valor: unknown }[]) conteudo[l.grupo] = l.valor
  return NextResponse.json({ conteudo }, { headers: cors })
}
