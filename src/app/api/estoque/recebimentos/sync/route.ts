import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { sincronizarRecebimentos, getRecebSyncEstado } from '@/lib/estoque/recebimentos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Sincronização manual (botão Atualizar). NOVO no Portal: roda
// ListarRecebimentos -> recebimentos_nfe para a conta pedida (default NOVA em
// modo Todas). O cron faz o mesmo para todas as contas periodicamente.
export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const estado = await sincronizarRecebimentos(conta);
    return NextResponse.json({ ok: !estado.erro, conta, estado });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

// Status do sync em memória (para o front, se quiser exibir).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  return NextResponse.json({ conta, estado: getRecebSyncEstado(conta) });
}
