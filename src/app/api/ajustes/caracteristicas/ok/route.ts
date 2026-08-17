/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const dynamic = 'force-dynamic';

// Marca "OK / conferido" COMPARTILHADA, por PRODUTO (empresa × codigo_produto).
// Excludente com a sinalização: marcar OK apaga as pendencias do produto.
// Leitura livre; escrita autenticada e via service role (RLS bloqueia o cliente).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET → todos os produtos marcados OK.
export async function GET() {
  const { data, error } = await supabase
    .from('caracteristicas_ok')
    .select('empresa, codigo_produto, conferido_nome, conferido_em');
  if (error) {
    console.error('[ok] GET erro:', error.message);
    return NextResponse.json({ erro: 'Falha ao carregar conferidos.' }, { status: 500 });
  }
  return NextResponse.json({ ok: data || [] });
}

// POST { empresa, codigo_produto, ok } → liga/desliga o "OK" do produto.
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { empresa, codigo_produto, ok } = (await req.json().catch(() => ({}))) as any;
    if (!empresa || codigo_produto == null)
      return NextResponse.json({ erro: 'empresa e codigo_produto sao obrigatorios' }, { status: 400 });

    const cp = String(codigo_produto);
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const nome = perfil?.nome || auth.email || '—';

    if (ok) {
      const { error } = await supabase
        .from('caracteristicas_ok')
        .upsert(
          { empresa, codigo_produto: cp, conferido_por: auth.userId, conferido_nome: nome, conferido_em: new Date().toISOString() },
          { onConflict: 'empresa,codigo_produto' },
        );
      if (error) throw error;
      // excludencia: marcar OK apaga as pendencias do produto
      await supabase.from('caracteristicas_sinalizacoes').delete().eq('empresa', empresa).eq('codigo_produto', cp);
    } else {
      const { error } = await supabase
        .from('caracteristicas_ok')
        .delete()
        .eq('empresa', empresa).eq('codigo_produto', cp);
      if (error) throw error;
    }

    registrarAuditLog({
      userId: auth.userId, userName: nome, sistema: 'caracteristicas', acao: 'conferir',
      entidade: 'produto', entidadeId: `${empresa}:${cp}`, detalhes: { ok: !!ok },
    });

    return NextResponse.json({ ok: true, conferido_nome: nome });
  } catch (e) {
    console.error('[ok] POST erro:', (e as Error).message);
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
