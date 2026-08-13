/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aplicarTipoLote } from '@/lib/ajustes/caracteristicas';
import { autenticar } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// WRITE no Omie: aplica em lote os valores de "Tipo:" confirmados (throttle + audita).
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { itens, nome } = (await req.json().catch(() => ({}))) as any;
    if (!Array.isArray(itens) || !itens.length) return NextResponse.json({ erro: 'itens vazio' }, { status: 400 });
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const autor = { userId: auth.userId, userName: perfil?.nome || auth.email || '—' };
    const r = await aplicarTipoLote(itens, nome, autor);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
