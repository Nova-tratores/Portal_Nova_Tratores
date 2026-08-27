import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { sugestoesSazonaisCliente } from '@/lib/estoque/inteligencia-comercial';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Sugestões sazonais de UM cliente (para o expand da aba Clientes).
// GET ?cliente=<codigo_cliente>&conta=  (opcional &mes=&lead=)
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const cliente = req.nextUrl.searchParams.get('cliente');
  if (!cliente) return NextResponse.json({ erro: 'informe o cliente' }, { status: 400 });
  const sp = req.nextUrl.searchParams;
  const mes = sp.get('mes') ? Number(sp.get('mes')) : undefined;
  const lead = sp.get('lead') ? Number(sp.get('lead')) : undefined;
  try {
    return NextResponse.json(await sugestoesSazonaisCliente(conta, cliente, { mes, lead }));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
