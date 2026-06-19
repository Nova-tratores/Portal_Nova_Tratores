/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { aplicarTipoLote } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// WRITE no Omie: aplica em lote os valores de "Tipo:" confirmados (throttle).
export async function POST(req: NextRequest) {
  try {
    const { itens, nome } = (await req.json().catch(() => ({}))) as any;
    if (!Array.isArray(itens) || !itens.length) return NextResponse.json({ erro: 'itens vazio' }, { status: 400 });
    const r = await aplicarTipoLote(itens, nome);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
