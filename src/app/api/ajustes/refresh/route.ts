import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { invalidarAnalise } from '@/lib/ajustes/cmc';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Invalida o cache de análise de uma conta (o front normalmente usa ?force=1 direto).
export async function POST(req: NextRequest) {
  // Sem chamador no front hoje; o cache é o da análise do Dashboard CMC (/ajustes).
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'dashboard' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const invalidadas = invalidarAnalise(conta);
  return NextResponse.json({ ok: true, invalidadas });
}
