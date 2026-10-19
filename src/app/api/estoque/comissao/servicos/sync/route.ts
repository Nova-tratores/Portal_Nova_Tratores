import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { syncServicos } from '@/lib/estoque/comissao';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/comissao (pode('estoque','comissao')).
const OPCOES = [{ modulo: 'estoque', acao: 'comissao' }];
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const sp = req.nextUrl.searchParams;
  const body = (await req.json().catch(() => ({}))) as { mes?: unknown; ano?: unknown };
  const mes = parseInt(String(body.mes ?? sp.get('mes') ?? ''), 10);
  const ano = parseInt(String(body.ano ?? sp.get('ano') ?? ''), 10);
  if (!mes || !ano) return NextResponse.json({ erro: 'mes e ano obrigatorios' }, { status: 400 });
  try {
    const r = await syncServicos(conta, mes, ano);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
