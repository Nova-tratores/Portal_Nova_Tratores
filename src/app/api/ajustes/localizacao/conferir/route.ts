/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const dynamic = 'force-dynamic';

// Marca "localização conferida" COMPARTILHADA, por PRODUTO (empresa × codigo_produto).
// status 'conferido' (✓) / 'divergente' (⚠). Separada do caracteristicas_ok.
// Leitura livre; escrita autenticada via service role (RLS bloqueia o cliente).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET → todas as conferências.
export async function GET() {
  const { data, error } = await supabase
    .from('localizacao_conferida')
    .select('empresa, codigo_produto, status, posicao, conferido_nome, conferido_em');
  if (error) {
    console.error('[localizacao/conferir] GET erro:', error.message);
    return NextResponse.json({ erro: 'Falha ao carregar conferências.' }, { status: 500 });
  }
  return NextResponse.json({ conferidas: data || [] });
}

// POST { empresa, codigo_produto, status, posicao } → grava ✓/⚠ ou limpa (status vazio).
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { empresa, codigo_produto, status, posicao } = (await req.json().catch(() => ({}))) as any;
    if (!empresa || codigo_produto == null)
      return NextResponse.json({ erro: 'empresa e codigo_produto sao obrigatorios' }, { status: 400 });
    if (status != null && status !== 'conferido' && status !== 'divergente')
      return NextResponse.json({ erro: 'status invalido' }, { status: 400 });

    const cp = String(codigo_produto);
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const nome = perfil?.nome || auth.email || '—';

    if (status) {
      const { error } = await supabase
        .from('localizacao_conferida')
        .upsert(
          { empresa, codigo_produto: cp, status, posicao: posicao ?? null, conferido_por: auth.userId, conferido_nome: nome, conferido_em: new Date().toISOString() },
          { onConflict: 'empresa,codigo_produto' },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('localizacao_conferida')
        .delete()
        .eq('empresa', empresa).eq('codigo_produto', cp);
      if (error) throw error;
    }

    registrarAuditLog({
      userId: auth.userId, userName: nome, sistema: 'localizacao', acao: 'conferir',
      entidade: 'produto', entidadeId: `${empresa}:${cp}`, detalhes: { status: status || null, posicao: posicao || null },
    });

    return NextResponse.json({ ok: true, conferido_nome: nome });
  } catch (e) {
    console.error('[localizacao/conferir] POST erro:', (e as Error).message);
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
