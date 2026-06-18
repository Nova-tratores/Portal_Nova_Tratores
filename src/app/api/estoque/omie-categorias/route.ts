import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarCategoriasOmie } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Categorias Omie (código → descrição). Portado de /api/omie-categorias (server.js:4222).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const categorias = await listarCategoriasOmie(conta);
    return NextResponse.json({ total: categorias.length, categorias });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
