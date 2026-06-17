import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { copiarCustosMesAnterior } from '@/lib/estoque/comissao';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const sp = req.nextUrl.searchParams;
  const body = (await req.json().catch(() => ({}))) as { mes?: unknown; ano?: unknown };
  const mes = parseInt(String(body.mes ?? sp.get('mes') ?? ''), 10);
  const ano = parseInt(String(body.ano ?? sp.get('ano') ?? ''), 10);
  if (!mes || !ano) return NextResponse.json({ erro: 'mes e ano obrigatorios' }, { status: 400 });
  try {
    const r = await copiarCustosMesAnterior(conta, mes, ano);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
