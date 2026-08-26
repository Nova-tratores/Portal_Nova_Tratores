import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { comprasPorProduto, clientesResumo, oportunidadesRFM } from '@/lib/estoque/inteligencia-comercial';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Agregados do módulo Inteligência Comercial. ?aba=compras|clientes|oportunidades + conta.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const aba = (req.nextUrl.searchParams.get('aba') || 'compras').toLowerCase();
  try {
    if (aba === 'clientes') return NextResponse.json(await clientesResumo(conta));
    if (aba === 'oportunidades') return NextResponse.json(await oportunidadesRFM(conta));
    return NextResponse.json(await comprasPorProduto(conta));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
