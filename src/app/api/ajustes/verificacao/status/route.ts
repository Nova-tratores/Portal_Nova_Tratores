import { NextResponse } from 'next/server';
import { lerStatusVerificacao } from '@/lib/ajustes/verificacao';

export const dynamic = 'force-dynamic';

// Status da verificacao diaria (le o job no Supabase).
export async function GET() {
  try {
    return NextResponse.json(await lerStatusVerificacao());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
