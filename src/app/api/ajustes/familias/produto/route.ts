import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { alterarFamiliaProduto } from '@/lib/ajustes/familias';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { conta, codigo_produto, codigo_familia } -> grava na Omie + Supabase.
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => ({}))) as {
      conta?: string; codigo_produto?: number | string; codigo_familia?: number | string;
    };
    const conta = parseConta(b?.conta) || CONTA_DEFAULT;
    const codigoProduto = Number(b?.codigo_produto);
    const codigoFamilia = Number(b?.codigo_familia);
    if (!codigoProduto || !codigoFamilia) {
      return NextResponse.json({ erro: 'codigo_produto e codigo_familia são obrigatórios' }, { status: 400 });
    }
    const r = await alterarFamiliaProduto(conta, codigoProduto, codigoFamilia);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
