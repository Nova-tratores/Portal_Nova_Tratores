/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { listarFolhas, getFolha, registrarFolha } from '@/lib/ppv/etiquetas-fila';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET: ?id= → { folha } (p/ reimprimir); senão → { folhas: [...] } (histórico).
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const folha = await getFolha(Number(id));
      if (!folha) return NextResponse.json({ erro: 'Folha não encontrada' }, { status: 404 });
      return NextResponse.json({ folha });
    }
    return NextResponse.json({ folhas: await listarFolhas() });
  } catch (e) { return NextResponse.json({ erro: (e as Error).message }, { status: 500 }); }
}

// POST: registra a folha impressa (snapshot). body { formato, rastreado, usadas, itens }
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const autor = { userId: auth.userId, userName: perfil?.nome || auth.email || '—' };
    const body = (await req.json().catch(() => ({}))) as any;
    const folha = await registrarFolha(body, autor);
    return NextResponse.json({ ok: true, folha });
  } catch (e) { return NextResponse.json({ erro: (e as Error).message }, { status: 500 }); }
}
