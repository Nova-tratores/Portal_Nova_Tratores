import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { darEntradaRecebimento, type DarEntradaArgs } from '@/lib/ajustes/recebimentos';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: conclui (dá entrada em) um recebimento de NF-e (AlterarRecebimento + ConcluirRecebimento).
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<DarEntradaArgs>;
    const conta = parseConta((body.conta as string) ?? req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
    const r = await darEntradaRecebimento({ ...body, conta } as DarEntradaArgs);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 502 });
  }
}
