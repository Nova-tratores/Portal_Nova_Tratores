import { NextResponse } from 'next/server';
import { lerMatrizCaracteristicas } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Matriz de características (lê do Supabase produtos_caracteristicas).
export async function GET() {
  try {
    return NextResponse.json(await lerMatrizCaracteristicas());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
