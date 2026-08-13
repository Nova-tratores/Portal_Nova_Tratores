/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { editarCaractProduto } from '@/lib/ajustes/caracteristicas';
import { autenticar } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// WRITE no Omie: edita a característica de um produto (grava Omie + Supabase + audita).
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { empresa, codigo_produto, nome, conteudo } = (await req.json().catch(() => ({}))) as any;
    if (!empresa || !codigo_produto || !nome)
      return NextResponse.json({ erro: 'empresa, codigo_produto e nome sao obrigatorios' }, { status: 400 });
    // Nome vem da tabela pelo id do token — não do cliente (não-forjável).
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const autor = { userId: auth.userId, userName: perfil?.nome || auth.email || '—' };
    const r = await editarCaractProduto(empresa, codigo_produto, nome, conteudo, autor);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
