import { NextRequest, NextResponse } from 'next/server';
import { buscarProdutos } from '@/lib/ajustes/ajuste-estoque';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import type { Conta } from '@/lib/ajustes/conta';

export const dynamic = 'force-dynamic';

// Busca produtos no espelho `produtos` (código ou descrição). Sem conta = as duas.
export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: 'ajustes', acao: 'ajuste-estoque' }]);
  if (acesso.resposta) return acesso.resposta;
  const q = req.nextUrl.searchParams.get('q') || '';
  const c = (req.nextUrl.searchParams.get('conta') || '').toUpperCase();
  const conta = c === 'NOVA' || c === 'CASTRO' ? (c as Conta) : null;
  try {
    return NextResponse.json({ ok: true, produtos: await buscarProdutos(q, conta) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
