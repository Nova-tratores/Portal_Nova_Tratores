import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { repopularProdutoTipo } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Apaga produto_tipo da conta e re-busca tipo+familia da Omie. Portado de
// GET /api/admin/repopular-produto-tipo (server.js:1719).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  try {
    const r = await repopularProdutoTipo(conta);
    return NextResponse.json({ ok: true, conta, ...r });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
