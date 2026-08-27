import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterCategorias, categoriasComUso } from '@/lib/ajustes/contas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const comUso = req.nextUrl.searchParams.get('comUso') === '1';
  try {
    const categorias = comUso ? await categoriasComUso(conta) : await obterCategorias(conta);
    return NextResponse.json({ categorias });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
