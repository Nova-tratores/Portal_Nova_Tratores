import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarCompras } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Compras (entradas) do período, só peças — itens que compõem o card "Comprei".
// `modo=ano` (ou mes=0) soma os 12 meses do ano. Portado de /api/dashboard/compras.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  const ehAno = sp.get('modo') === 'ano' || mes === 0;
  if (!ano || (!ehAno && !mes)) return NextResponse.json({ erro: 'Informe mes e ano' });
  try {
    const compras = ehAno
      ? (await Promise.all(Array.from({ length: 12 }, (_, i) => listarCompras(i + 1, ano, conta)))).flat()
      : await listarCompras(mes, ano, conta);
    return NextResponse.json({ compras, total: compras.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
