import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { getUrlDanfe } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';

// URL do DANFE (PDF). Portado de /api/danfe (server.js:7170).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  try {
    const url = await getUrlDanfe(
      { ncod_nf: sp.get('ncod_nf') || undefined, numero_nf: sp.get('numero_nf') || undefined, serie: sp.get('serie') || undefined },
      conta ?? CONTA_DEFAULT,
    );
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
