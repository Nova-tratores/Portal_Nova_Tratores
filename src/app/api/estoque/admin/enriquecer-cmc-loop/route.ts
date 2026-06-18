import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { iniciarEnriquecimentoCMC } from '@/lib/estoque/cmc-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Backfill de CMC em loop até esgotar (background). Portado de
// GET /api/admin/enriquecer-cmc-loop (server.js:1894).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  const r = iniciarEnriquecimentoCMC(conta);
  if (r.erro) return NextResponse.json(r);
  return NextResponse.json({ ...r, mensagem: 'Iniciado em background. Veja /api/estoque/admin/enriquecer-cmc-status?conta=' + conta });
}
