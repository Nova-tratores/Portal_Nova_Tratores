import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { listarCustosVendedor, salvarCustoVendedor } from '@/lib/estoque/comissao';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const sp = req.nextUrl.searchParams;
  const mes = sp.get('mes') ? parseInt(sp.get('mes')!, 10) : null;
  const ano = sp.get('ano') ? parseInt(sp.get('ano')!, 10) : null;
  if (!mes || !ano) return NextResponse.json({ erro: 'mes e ano obrigatorios' }, { status: 400 });
  try {
    const r = await listarCustosVendedor(conta, mes, ano);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await salvarCustoVendedor(conta, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
