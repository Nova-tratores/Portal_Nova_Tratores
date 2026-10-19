import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { listarServicos } from '@/lib/estoque/comissao';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/comissao (pode('estoque','comissao')).
const OPCOES = [{ modulo: 'estoque', acao: 'comissao' }];

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const sp = req.nextUrl.searchParams;
  const mes = sp.get('mes') ? parseInt(sp.get('mes')!, 10) : null;
  const ano = sp.get('ano') ? parseInt(sp.get('ano')!, 10) : null;
  const status = sp.get('status') || 'all';
  try {
    const r = await listarServicos(conta, mes, ano, status);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
