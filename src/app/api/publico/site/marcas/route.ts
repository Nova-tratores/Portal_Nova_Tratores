// Marcas gravadas no portal (aberto, sem login), lidas pelo SITE no build: logo, foto do banner, texto e itens sob consulta.
import { NextResponse } from 'next/server'
import { corsSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function GET(req: Request) {
  const cors = corsSite(req)
  const { data, error } = await sb.from('site_marcas').select('nome, logo, banner, sobre, sob_consulta, ordem').order('nome')
  if (error) return NextResponse.json({ marcas: [] }, { headers: cors })
  return NextResponse.json({ marcas: data || [] }, { headers: cors })
}
