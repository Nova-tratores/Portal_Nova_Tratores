import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { serieMensal, ultimosMeses, type Dimensao } from '@/lib/estoque/cruzamento-familia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/estoque/cruzamento-familia/serie?meses=12&dimensao=tipo|categoria&conta=NOVA
// Série mensal: Estoque Peça/Máquina + NF Entrada/Saída por tipo ou por categoria.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const n = Math.min(48, Math.max(2, parseInt(sp.get('meses') || '12') || 12));
  const dimRaw = sp.get('dimensao');
  const dimensao: Dimensao = dimRaw === 'categoria' || dimRaw === 'familia' || dimRaw === 'tipocarac' ? dimRaw : 'tipo';
  const conta = parseConta(sp.get('conta'));
  const incluirDemo = sp.get('demo') !== '0'; // default ligado

  try {
    const r = await serieMensal(ultimosMeses(n), conta, dimensao, incluirDemo);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
