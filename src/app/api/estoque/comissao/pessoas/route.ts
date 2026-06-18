import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { listarPessoas, criarPessoa } from '@/lib/estoque/comissao';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const tipo = req.nextUrl.searchParams.get('tipo');
  try {
    const items = await listarPessoas(conta, tipo);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const body = (await req.json().catch(() => ({}))) as Parameters<typeof criarPessoa>[1];
    const { id, pessoa } = await criarPessoa(conta, body);
    return NextResponse.json({ ok: true, id, pessoa });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
