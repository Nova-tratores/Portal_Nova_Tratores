import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { getConfig, setConfig } from '@/lib/estoque/comissao';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/comissao (pode('estoque','comissao')).
const OPCOES = [{ modulo: 'estoque', acao: 'comissao' }];

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const data = await getConfig(conta);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const body = (await req.json().catch(() => ({}))) as { comissao_base_pct_servicos?: unknown };
    await setConfig(conta, body.comissao_base_pct_servicos);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
