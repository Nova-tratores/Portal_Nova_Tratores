import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { syncNotasSaida, syncNotasTodasContas } from '@/lib/ajustes/notas-sync';
import { protegerRotaOuInterna } from '@/lib/auth/chamada-interna';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

// Trigger manual do sync de notas (backfill/incremental). Sem chamador no codigo:
// roda por curl com Bearer CRON_SECRET (ou x-cron-secret) ou por admin logado.
// Fechado tambem sem CRON_SECRET no ambiente (antes ficava aberto no local).

export async function GET(req: NextRequest) {
  const g = await protegerRotaOuInterna(req, [{ admin: true }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const modo = (sp.get('modo') === 'backfill' ? 'backfill' : 'incremental') as 'backfill' | 'incremental';
  const desdeBR = sp.get('desde') || undefined;
  const ateBR = sp.get('ate') || undefined;
  const contaRaw = parseConta(sp.get('conta'));
  const log = (m: string) => console.log('[api notas/sync]', m);
  try {
    const resultado = contaRaw
      ? [await syncNotasSaida(contaRaw, { modo, desdeBR, ateBR, onProgress: log })]
      : await syncNotasTodasContas({ modo, desdeBR, ateBR, onProgress: log });
    return NextResponse.json({ sucesso: true, modo, resultado, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
