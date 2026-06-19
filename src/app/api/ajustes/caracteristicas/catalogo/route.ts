import { NextResponse } from 'next/server';
import { catalogoCaracteristicas } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Catálogo da Omie: valores permitidos por característica (união + por empresa).
export async function GET() {
  try {
    return NextResponse.json(await catalogoCaracteristicas());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
