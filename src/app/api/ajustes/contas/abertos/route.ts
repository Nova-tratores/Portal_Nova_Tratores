import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { titulosAbertos } from '@/lib/ajustes/contas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Títulos EM ABERTO (A VENCER / ATRASADO / VENCE HOJE) de uma empresa+tipo.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'baixa-contas' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar';
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT; // a tela trabalha 1 empresa por vez
  try {
    return NextResponse.json(await titulosAbertos(tipo, conta));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
