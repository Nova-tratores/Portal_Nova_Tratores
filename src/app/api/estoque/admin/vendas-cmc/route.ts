import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarVendasCMC } from '@/lib/estoque/cmc-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lista vendas_itens com cmc_unitario (paginado, filtrável). Portado de
// GET /api/admin/vendas-cmc (server.js:2034).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  try {
    const pagina = parseInt(sp.get('pagina') || '', 10) || 1;
    const filtro = sp.get('filtro') || 'todos';
    const busca = (sp.get('busca') || '').trim();
    return NextResponse.json(await listarVendasCMC(conta, pagina, filtro, busca));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
