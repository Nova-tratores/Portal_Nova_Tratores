import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { enriquecerCMCLote } from '@/lib/estoque/cmc-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Backfill de cmc_unitario num lote (foreground, paginado pela UI). Portado de
// GET /api/admin/enriquecer-cmc (server.js:1761). ?limite=N (default 100).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  const limite = parseInt(sp.get('limite') || '', 10) || 100;
  try {
    return NextResponse.json(await enriquecerCMCLote(conta, limite));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
