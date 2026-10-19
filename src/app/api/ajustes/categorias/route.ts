import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterCategorias, categoriasComUso } from '@/lib/ajustes/contas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Telas: /ajustes/correcao-contas e /estoque/recebimentos.
  const g = await protegerRota(req, [
    { modulo: 'ajustes', acao: 'correcao-contas' },
    { modulo: 'estoque', acao: 'recebimentos' },
    { modulo: 'ajustes', acao: 'recebimentos' },
  ]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const comUso = req.nextUrl.searchParams.get('comUso') === '1';
  try {
    const categorias = comUso ? await categoriasComUso(conta) : await obterCategorias(conta);
    return NextResponse.json({ categorias });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
