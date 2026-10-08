import { NextRequest, NextResponse } from 'next/server';
import { negarSemDashboard } from '@/lib/estoque/dashboard-auth';
import { parseConta } from '@/lib/estoque/conta';
import { listarPedidoItens } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';

// Itens de um pedido (popup de composição). Portado de
// /api/dashboard/pedido-itens (server.js:3292).
export async function GET(req: NextRequest) {
  const negado = await negarSemDashboard(req);
  if (negado) return negado;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const numeroPedido = sp.get('numero_pedido');
  const mes = parseInt(sp.get('mes') || '');
  const ano = parseInt(sp.get('ano') || '');
  if (!numeroPedido) return NextResponse.json({ erro: 'Informe numero_pedido' });
  try {
    const itens = await listarPedidoItens(numeroPedido, mes, ano, conta);
    return NextResponse.json({ itens, total: itens.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
