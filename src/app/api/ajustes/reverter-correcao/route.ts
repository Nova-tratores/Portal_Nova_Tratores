import { NextRequest, NextResponse } from 'next/server';
import { reverterCorrecao, type HttpError } from '@/lib/ajustes/cmc';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// WRITE no Omie: reverte uma correção (ExcluirAjusteEstoque) + marca revertido.
export async function POST(req: NextRequest) {
  // Onda 0: exige login e permissao; o autor sai do login, nao do corpo.
  const acesso = await protegerRota(req, [{ modulo: 'ajustes', acao: 'historico' }]);
  if (acesso.resposta) return acesso.resposta;
  try {
    const body = (await req.json().catch(() => ({}))) as { correcaoId?: number | string; id?: number | string };
    const correcaoId = body.correcaoId ?? body.id;
    if (correcaoId == null) return NextResponse.json({ ok: false, erro: 'informe correcaoId' }, { status: 400 });
    const r = await reverterCorrecao(Number(correcaoId));
    return NextResponse.json(r);
  } catch (e) {
    const err = e as HttpError;
    return NextResponse.json({ ok: false, erro: err.message }, { status: err.http || 500 });
  }
}
