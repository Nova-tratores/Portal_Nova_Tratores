import { NextResponse } from 'next/server'
import { CATALOGO_OCORRENCIAS, CATEGORIAS, LEGADO_TIPOS } from '@/lib/ocorrencias/catalogo'

// Catálogo público de ocorrências (labels/pontos/cores) — consumido pelo
// app NT_Mecanicos com cache + fallback local. Sem dados sensíveis.
export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(
    {
      versao: 2,
      categorias: CATEGORIAS,
      catalogo: CATALOGO_OCORRENCIAS,
      legado: LEGADO_TIPOS,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
