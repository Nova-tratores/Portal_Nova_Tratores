// Avisa (e-mail + Chatwoot) quem precisa autorizar a requisição — chamado pela tela logo depois de
// pedir a autorização (24/11/2026). POST { id }. Qualquer pessoa logada; o servidor só avisa se a
// requisição está mesmo "aguardando" e não repete em menos de 10 min.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { avisarPedidoRequisicao } from '@/lib/autorizacoes/avisar';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'pedido inválido' }, { status: 400 });
  try {
    return NextResponse.json(await avisarPedidoRequisicao(id, auth.userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
