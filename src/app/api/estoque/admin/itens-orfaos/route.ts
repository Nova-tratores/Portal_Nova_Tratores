import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { parseConta } from '@/lib/estoque/conta';
import { itensOrfaos } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Itens órfãos (não caem em cat1/cat2 nem são "pecas") por mês. Portado de
// GET /api/admin/itens-orfaos (server.js:2265).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'admin' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  try {
    const r = await itensOrfaos(conta);
    return NextResponse.json({ conta, ...r });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
