import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterDetalhe } from '@/lib/ajustes/descricoes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET ?conta=NOVA&codigo_produto=123 -> { descricao, descr_detalhada } (lazy Omie)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const conta = parseConta(sp.get('conta')) || CONTA_DEFAULT;
    const codigoProduto = Number(sp.get('codigo_produto'));
    if (!codigoProduto) {
      return NextResponse.json({ erro: 'codigo_produto é obrigatório' }, { status: 400 });
    }
    const r = await obterDetalhe(conta, codigoProduto);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
