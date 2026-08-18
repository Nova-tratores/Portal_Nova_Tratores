// POST /api/frota/pendencias/sync — dispara a sincronização das pendências
// automáticas da frota. Aceita QUALQUER usuário autenticado do portal (sem
// exigir o módulo Frota) de propósito: quem cria uma requisição "Veicular
// Manutenção" dispara isto pra pendência nascer NA HORA, mesmo sem acesso à
// Frota. Não devolve dado nenhum — só roda o motor (lib/frota/pendencias-sync).
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { sincronizarPendencias } from '@/lib/frota/pendencias-sync';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  try {
    await sincronizarPendencias();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
