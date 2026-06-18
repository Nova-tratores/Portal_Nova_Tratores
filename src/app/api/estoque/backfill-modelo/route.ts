import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { iniciarBackfillModelo } from '@/lib/estoque/cmc-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Backfill do campo `modelo` em produtos via Omie ListarProdutos (background).
// modelo é global (produtos não tem conta_omie); default conta=NOVA.
// ?so_vazios=0 atualiza todos. Portado de GET /api/backfill-modelo (server.js:1913).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const soVazios = sp.get('so_vazios') !== '0';
  const r = iniciarBackfillModelo(conta, soVazios);
  if (r.erro) return NextResponse.json(r);
  return NextResponse.json({ ...r, mensagem: 'Backfill modelo iniciado em background. Acompanhe em /api/estoque/backfill-modelo-status?conta=' + conta });
}
