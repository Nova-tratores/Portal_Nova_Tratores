import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { serieMensal, ultimosMeses } from '@/lib/estoque/cruzamento-familia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/estoque/cruzamento-familia/serie?meses=12&conta=NOVA
// Série mensal: Estoque Peça, Estoque Máquina, NF Entrada, NF Saída (valores R$).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(36, Math.max(2, parseInt(sp.get('meses') || '12') || 12));
  const conta = parseConta(sp.get('conta'));

  try {
    const r = await serieMensal(ultimosMeses(n), conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
