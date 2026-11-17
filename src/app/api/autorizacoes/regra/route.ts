// Limite de cada assunto (ex.: requisição a partir de R$ 200). Só Diretor ou Dev. PUT { assunto, limite, ativo }
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { quemAutoriza, salvarRegra } from '@/lib/autorizacoes/server';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const autor = await quemAutoriza(await autenticar(req));
  if (!autor?.completo) return NextResponse.json({ error: 'Só o Diretor ou um Dev muda o limite.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const assunto = String(body?.assunto || '');
  const limite = Number(body?.limite);
  if (!assunto || !Number.isFinite(limite) || limite < 0) return NextResponse.json({ error: 'limite inválido' }, { status: 400 });
  try {
    await salvarRegra(assunto, limite, body?.ativo !== false, autor.nome);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
