import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarCategoriasVendas } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';

// Grupos de categoria presentes em vendas (dropdown). Portado de
// /api/dashboard/categorias-vendas (server.js:3070).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const categorias = await listarCategoriasVendas(conta);
    return NextResponse.json({ categorias });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
