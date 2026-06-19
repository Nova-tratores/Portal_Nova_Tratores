import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { listarEncerramentos } from '@/lib/ajustes/pedidos';

export const dynamic = 'force-dynamic';

// Lista os encerramentos informais (Supabase). Query: conta?, de?, ate?.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  try {
    const linhas = await listarEncerramentos({
      conta,
      de: sp.get('de') || undefined,
      ate: sp.get('ate') || undefined,
    });
    return NextResponse.json({ linhas });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
