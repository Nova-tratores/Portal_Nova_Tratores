import { NextRequest, NextResponse } from 'next/server';
import { montarProposta } from '@/lib/ajustes/catalogo-caracteristicas';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // varre catalogo_pecas (~95k linhas) + produtos

// GET [?atualizar=1] -> { itens, resumo }  (proposta Sistema/Sub-sistema, conta NOVA)
export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('atualizar') === '1';
    const proposta = await montarProposta({ force });
    return NextResponse.json(proposta);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
