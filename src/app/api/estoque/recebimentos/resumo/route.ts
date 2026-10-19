import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { resumoRecebimentos } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/recebimentos-omie (pode('estoque','recebimentos-omie')).
const OPCOES = [{ modulo: 'estoque', acao: 'recebimentos-omie' }];

// Contadores por tipo/status (badges das abas). Portado de GET /api/recebimentos/resumo (server.js:7666).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  try {
    const resumo = await resumoRecebimentos(conta, sp.get('meu') || '');
    return NextResponse.json(resumo);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
