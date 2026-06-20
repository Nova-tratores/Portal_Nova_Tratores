import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { lerStatusGeracao } from '@/lib/ajustes/mahindra';

export const dynamic = 'force-dynamic';

// GET: estado da geracao (worker-ready, le do job no Supabase).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    return NextResponse.json(await lerStatusGeracao(conta));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
