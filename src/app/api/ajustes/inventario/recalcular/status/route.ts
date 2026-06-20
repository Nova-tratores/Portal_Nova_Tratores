import { NextResponse } from 'next/server';
import { lerStatusRecalculo } from '@/lib/ajustes/inventario';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await lerStatusRecalculo());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
