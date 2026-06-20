import { NextResponse } from 'next/server';
import { lerStatusSync } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await lerStatusSync());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
