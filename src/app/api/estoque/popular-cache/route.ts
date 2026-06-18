import { NextRequest, NextResponse } from 'next/server';
import { parseConta, getContasOmie, type Conta } from '@/lib/estoque/conta';
import { iniciarPopularCache } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Popula vendas (runs trimestrais) + OS em background, lock per-conta.
// Portado de GET /api/popular-cache (server.js:1598). ?forcar=1 limpa antes.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const forcar = sp.get('forcar') === '1';
  const contasAlvo: Conta[] = conta ? [conta] : getContasOmie().map((c) => c.id);
  if (contasAlvo.length === 0) return NextResponse.json({ erro: 'Nenhuma conta Omie configurada' });

  const { contasIniciadas, contasPuladas } = iniciarPopularCache(contasAlvo, forcar);
  if (contasIniciadas.length === 0) {
    return NextResponse.json({ erro: 'Todas as contas solicitadas ja estao sincronizando', puladas: contasPuladas });
  }
  return NextResponse.json({ mensagem: 'Populando cache em background (paralelo)', contasIniciadas, contasPuladas });
}
