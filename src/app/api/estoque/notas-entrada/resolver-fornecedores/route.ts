import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { iniciarResolverFornecedores, getResolverFornStatus } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';

// Dispara (fire-and-forget) o job que resolve nome_emitente por CNPJ em todo o
// histórico. conta vazia => NOVA + CASTRO. Retorna imediatamente com o status.
export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const r = iniciarResolverFornecedores(conta);
  return NextResponse.json({ ...r, status: getResolverFornStatus() }, { status: r.ok ? 200 : 409 });
}
