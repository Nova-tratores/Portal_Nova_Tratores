/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { encerrarPedidoInformal } from '@/lib/ajustes/pedidos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// WRITE: encerra um pedido informalmente (baixa SAI dos itens -> obs no pedido ->
// cancela -> log de auditoria). Body: { conta, idPedido, numeroPedido?, razao, criadoPor? }.
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const conta = parseConta(b?.conta ?? req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
    const out = await encerrarPedidoInformal({
      conta,
      idPedido: b?.idPedido ?? null,
      numeroPedido: b?.numeroPedido ?? null,
      razao: b?.razao ?? '',
      criadoPor: b?.criadoPor,
    });
    return NextResponse.json(out);
  } catch (e) {
    const status = (e as { http?: number }).http || 500;
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status });
  }
}
