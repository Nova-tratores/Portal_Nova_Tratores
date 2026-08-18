/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { listarFila, adicionarFila, atualizarQtd, removerFila, limparFila } from '@/lib/ppv/etiquetas';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function autor(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return null;
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  return { userId: auth.userId, userName: data?.nome || auth.email || '—' };
}

// GET: fila compartilhada (livre).
export async function GET() {
  try {
    return NextResponse.json({ fila: await listarFila() });
  } catch (e) { return NextResponse.json({ erro: (e as Error).message }, { status: 500 }); }
}

// POST: adiciona uma marcação à fila.
export async function POST(req: NextRequest) {
  try {
    const a = await autor(req);
    if (!a) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as any;
    if (!b.empresa || !b.codigo_produto) return NextResponse.json({ erro: 'empresa e codigo_produto obrigatórios' }, { status: 400 });
    const item = await adicionarFila(b, a);
    return NextResponse.json({ ok: true, item });
  } catch (e) { return NextResponse.json({ erro: (e as Error).message }, { status: 500 }); }
}

// PATCH: altera a quantidade de um item da fila.
export async function PATCH(req: NextRequest) {
  try {
    const a = await autor(req);
    if (!a) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { id, quantidade } = (await req.json().catch(() => ({}))) as any;
    if (!id) return NextResponse.json({ erro: 'id obrigatório' }, { status: 400 });
    await atualizarQtd(Number(id), Number(quantidade));
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ erro: (e as Error).message }, { status: 500 }); }
}

// DELETE: remove um item (?id=) ou esvazia a fila (?limpar=1).
export async function DELETE(req: NextRequest) {
  try {
    const a = await autor(req);
    if (!a) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const id = req.nextUrl.searchParams.get('id');
    if (req.nextUrl.searchParams.get('limpar')) { await limparFila(); return NextResponse.json({ ok: true }); }
    if (!id) return NextResponse.json({ erro: 'id obrigatório' }, { status: 400 });
    await removerFila(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ erro: (e as Error).message }, { status: 500 }); }
}
