import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { alterarDescricao } from '@/lib/ajustes/descricoes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { conta, codigo_produto, descricao } -> grava a descrição resumida na Omie.
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as {
      conta?: string; codigo_produto?: number | string; descricao?: string;
    };
    const conta = parseConta(b?.conta) || CONTA_DEFAULT;
    const codigoProduto = Number(b?.codigo_produto);
    const descricao = String(b?.descricao ?? '').trim();
    if (!codigoProduto || !descricao) {
      return NextResponse.json({ erro: 'codigo_produto e descricao são obrigatórios' }, { status: 400 });
    }
    const r = await alterarDescricao(conta, codigoProduto, descricao);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
