import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { listarRegras, criarRegra } from '@/lib/estoque/comissao';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const dominio = req.nextUrl.searchParams.get('dominio');
  try {
    const items = await listarRegras(conta, dominio);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { id, regra } = await criarRegra(conta, body);
    return NextResponse.json({ ok: true, id, regra });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
