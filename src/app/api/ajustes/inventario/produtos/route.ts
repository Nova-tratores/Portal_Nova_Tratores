import { NextRequest, NextResponse } from 'next/server';
import { listarProdutosInventario } from '@/lib/ajustes/inventario';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lista produtos do inventário (por SKU, global). Filtros: classe, ativo, busca.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const out = await listarProdutosInventario({
      classe: sp.get('classe') || undefined,
      ativo: sp.get('ativo') || undefined,
      busca: sp.get('busca') || undefined,
      limit: parseInt(sp.get('limit') || '', 10) || undefined,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
