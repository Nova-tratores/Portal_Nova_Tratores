import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { listarCategoriasAdmin, salvarCategoriasAdmin } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Config de categorias do dashboard. Portado de GET/POST /api/admin/categorias
// (server.js:2072/2077).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'admin' }]);
  if (g.resposta) return g.resposta;
  return NextResponse.json(await listarCategoriasAdmin());
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'admin' }]);
  if (g.resposta) return g.resposta;
  const body = (await req.json().catch(() => ({}))) as { categorias?: Array<{ slug?: string; nome?: string; palavras_chave?: string }> };
  const r = await salvarCategoriasAdmin(body.categorias || []);
  if ('erro' in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
