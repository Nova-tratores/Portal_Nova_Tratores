import { NextResponse } from 'next/server';
import { sugestoesTipo } from '@/lib/ajustes/caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Sugere "Tipo:" para produtos com esse campo vazio (casamento da descrição).
export async function GET() {
  try {
    return NextResponse.json(await sugestoesTipo());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
