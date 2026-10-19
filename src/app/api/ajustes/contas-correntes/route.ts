import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterContasCorrentes } from '@/lib/ajustes/contas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Contas correntes (bancos/caixas) da empresa, para o dropdown da baixa.
export async function GET(req: NextRequest) {
  // Telas: /ajustes/baixa-contas, /ajustes/correcao-contas e /estoque/recebimentos.
  const g = await protegerRota(req, [
    { modulo: 'ajustes', acao: 'baixa-contas' },
    { modulo: 'ajustes', acao: 'correcao-contas' },
    { modulo: 'estoque', acao: 'recebimentos' },
    { modulo: 'ajustes', acao: 'recebimentos' },
  ]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    return NextResponse.json({ contasCorrentes: await obterContasCorrentes(conta) });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
