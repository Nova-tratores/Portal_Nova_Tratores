import { NextResponse } from 'next/server';
import { tarefasDeHoje } from '@/lib/ajustes/inventario';

export const dynamic = 'force-dynamic';

// Tarefas do dia para o contador (contagem cega: sem saldos).
export async function GET() {
  try {
    return NextResponse.json(await tarefasDeHoje());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
