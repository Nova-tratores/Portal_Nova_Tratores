import { NextRequest, NextResponse } from 'next/server';
import { aplicarAjusteCusto, type CorrecaoBody, type HttpError } from '@/lib/ajustes/cmc';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: aplica o CMC inicial de um produto (resolve local ao vivo).
export async function POST(req: NextRequest) {
  // Onda 0: exige login e permissao; o autor sai do login, nao do corpo.
  const acesso = await protegerRota(req, [{ modulo: 'ajustes', acao: 'ajuste-custos' }]);
  if (acesso.resposta) return acesso.resposta;
  try {
    const body = (await req.json().catch(() => ({}))) as CorrecaoBody;
    const r = await aplicarAjusteCusto({ ...body, criadoPor: autorDe(acesso.user) }, autorDe(acesso.user));
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json(
      { ok: false, erro: err.message, correcaoId: err.correcaoId ?? null },
      { status: err.http || 400 },
    );
  }
}
