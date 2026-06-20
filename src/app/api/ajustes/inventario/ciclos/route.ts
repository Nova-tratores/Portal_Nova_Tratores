import { NextResponse } from 'next/server';
import { listarCiclos } from '@/lib/ajustes/inventario';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await listarCiclos());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
