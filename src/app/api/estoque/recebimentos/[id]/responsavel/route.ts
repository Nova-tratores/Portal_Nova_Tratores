import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { setResponsavel } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/recebimentos-omie (pode('estoque','recebimentos-omie')).
const OPCOES = [{ modulo: 'estoque', acao: 'recebimentos-omie' }];

// Responsável (transferência) -> recebimento_meta. Portado de POST /api/recebimentos/:id/responsavel (server.js:7739).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { responsavel?: string };
    await setResponsavel(conta, parseInt(id, 10), body.responsavel);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'conta obrigatoria' ? 400 : 500;
    return NextResponse.json({ erro: msg }, { status });
  }
}
