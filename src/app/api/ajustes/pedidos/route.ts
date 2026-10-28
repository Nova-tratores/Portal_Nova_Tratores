import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterPedidos, janelaPedidosBR } from '@/lib/ajustes/pedidos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Lista pedidos de venda abertos (com cache 5min). Query: de/ate (YYYY-MM-DD)/force.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'pedidos' }]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  const { dataDeBR, dataAteBR } = janelaPedidosBR(sp.get('de'), sp.get('ate'));
  try {
    const out = await obterPedidos(conta, dataDeBR, dataAteBR, force);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 500 });
  }
}
