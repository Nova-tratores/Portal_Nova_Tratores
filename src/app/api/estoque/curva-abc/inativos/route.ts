import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarInativos } from '@/lib/estoque/curva-abc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Produtos inativos (sem movimentação). Portado de /api/curva-abc/inativos (server.js:3490).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const periodo = parseInt(sp.get('periodo') || '') || 12;
  const tipoCaract = (sp.get('tipo_caract') || '').trim();
  const filtroFamilia = (sp.get('familia') || '').trim();
  try {
    const r = await listarInativos(periodo, tipoCaract, filtroFamilia, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
