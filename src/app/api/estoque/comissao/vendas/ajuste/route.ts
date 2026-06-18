import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { ajustarVenda } from '@/lib/estoque/comissao';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ajuste = await ajustarVenda(conta, body);
    return NextResponse.json({ ok: true, ajuste });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
