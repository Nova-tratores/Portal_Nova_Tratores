import { NextRequest, NextResponse } from 'next/server';
import { listarCategoriasAdmin, salvarCategoriasAdmin } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Config de categorias do dashboard. Portado de GET/POST /api/admin/categorias
// (server.js:2072/2077).
export async function GET() {
  return NextResponse.json(await listarCategoriasAdmin());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { categorias?: Array<{ nome?: string; palavras_chave?: string }> };
  const r = await salvarCategoriasAdmin(body.categorias || []);
  if ('erro' in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
