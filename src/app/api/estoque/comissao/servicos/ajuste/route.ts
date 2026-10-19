import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { ajustarServico } from '@/lib/estoque/comissao';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/comissao (pode('estoque','comissao')).
const OPCOES = [{ modulo: 'estoque', acao: 'comissao' }];

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // autoria vem do login, nunca do corpo
    body.usuario = autorDe(g.user);
    const ajuste = await ajustarServico(conta, body);
    return NextResponse.json({ ok: true, ajuste });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
