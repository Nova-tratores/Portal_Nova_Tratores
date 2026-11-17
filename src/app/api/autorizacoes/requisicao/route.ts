// Autorizar/recusar requisição de valor alto (17/11/2026). Só Diretor ou Dev; autor = login.
// POST { id, acao: 'autorizar' | 'recusar', obs }
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { quemAutoriza, decidirRequisicao } from '@/lib/autorizacoes/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const autor = await quemAutoriza(await autenticar(req));
  if (!autor) return NextResponse.json({ error: 'Só o Diretor, um Dev ou quem tem "Autorizar requisições" autoriza.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  const acao = body?.acao === 'recusar' ? 'recusar' : body?.acao === 'autorizar' ? 'autorizar' : null;
  if (!Number.isInteger(id) || id <= 0 || !acao) return NextResponse.json({ error: 'pedido inválido' }, { status: 400 });
  try {
    return NextResponse.json(await decidirRequisicao(id, acao, String(body?.obs || '').slice(0, 500), autor));
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
