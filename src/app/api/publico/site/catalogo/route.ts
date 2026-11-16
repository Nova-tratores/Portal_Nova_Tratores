// O que o comercial mudou no catálogo do site (aberto, sem login): o site aplica por cima dos arquivos.
// Só produtos com alguma mudança; campos públicos (sem notas nem quem mudou). Cache de 1 min.
import { NextResponse } from 'next/server'
import { corsSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsSite(req) })
}

export async function GET(req: Request) {
  const cors = { ...corsSite(req), 'Cache-Control': 'public, max-age=60' }
  const { data, error } = await sb.from('site_catalogo').select('slug, preco, exibir_preco, pronta_entrega, oculto, selo')
  if (error) return NextResponse.json([], { headers: cors })
  return NextResponse.json(data || [], { headers: cors })
}
