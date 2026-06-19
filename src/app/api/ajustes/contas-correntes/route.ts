import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterContasCorrentes } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Contas correntes (bancos/caixas) da empresa, para o dropdown da baixa.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    return NextResponse.json({ contasCorrentes: await obterContasCorrentes(conta) });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
