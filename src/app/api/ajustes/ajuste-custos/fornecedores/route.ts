import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { listarFornecedores } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lista fornecedores (clientes) para o dropdown do ajuste de custos.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const payload = await listarFornecedores(conta);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
