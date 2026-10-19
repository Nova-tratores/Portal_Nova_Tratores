import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { setResponsavelReceb } from '@/lib/ajustes/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Transferencia de responsavel de um recebimento -> recebimento_meta
// (responsavel_user_id = financeiro_usu.id; responsavel = nome p/ exibicao).
// body: { userId: string|null, userNome: string|null } = o NOVO responsavel (nao e' autoria).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'recebimentos' }, { modulo: 'ajustes', acao: 'recebimentos' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { userId?: string | null; userNome?: string | null };
    await setResponsavelReceb(conta, parseInt(id, 10), body.userId ?? null, body.userNome ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
