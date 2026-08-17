/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const dynamic = 'force-dynamic';

// Sinalização (pendência) COMPARTILHADA de características, por célula
// (empresa × codigo_produto × coluna). Leitura livre (dado compartilhado);
// escrita autenticada e via service role (RLS bloqueia escrita do cliente).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET → todas as sinalizações ativas (dataset pequeno: só as marcadas).
export async function GET() {
  const { data, error } = await supabase
    .from('caracteristicas_sinalizacoes')
    .select('empresa, codigo_produto, coluna, sinalizado_nome, criado_em');
  if (error) {
    console.error('[sinalizar] GET erro:', error.message);
    return NextResponse.json({ erro: 'Falha ao carregar sinalizacoes.' }, { status: 500 });
  }
  return NextResponse.json({ sinalizacoes: data || [] });
}

// POST { empresa, codigo_produto, coluna, sinalizar } → liga/desliga a marcação.
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    const { empresa, codigo_produto, coluna, sinalizar } = (await req.json().catch(() => ({}))) as any;
    if (!empresa || codigo_produto == null || !coluna)
      return NextResponse.json({ erro: 'empresa, codigo_produto e coluna sao obrigatorios' }, { status: 400 });

    const cp = String(codigo_produto);
    // Nome do autor vem da tabela pelo id do token — não do cliente (não-forjável).
    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const nome = perfil?.nome || auth.email || '—';

    if (sinalizar) {
      const { error } = await supabase
        .from('caracteristicas_sinalizacoes')
        .upsert(
          { empresa, codigo_produto: cp, coluna, sinalizado_por: auth.userId, sinalizado_nome: nome, criado_em: new Date().toISOString() },
          { onConflict: 'empresa,codigo_produto,coluna' },
        );
      if (error) throw error;
      // excludencia: sinalizar uma pendencia remove o "OK" do produto
      await supabase.from('caracteristicas_ok').delete().eq('empresa', empresa).eq('codigo_produto', cp);
    } else {
      const { error } = await supabase
        .from('caracteristicas_sinalizacoes')
        .delete()
        .eq('empresa', empresa).eq('codigo_produto', cp).eq('coluna', coluna);
      if (error) throw error;
    }

    // trilha (best-effort, não bloqueia)
    registrarAuditLog({
      userId: auth.userId, userName: nome, sistema: 'caracteristicas', acao: 'sinalizar',
      entidade: 'produto_caracteristica', entidadeId: `${empresa}:${cp}`, entidadeLabel: coluna,
      detalhes: { coluna, sinalizar: !!sinalizar },
    });

    return NextResponse.json({ ok: true, sinalizado_nome: nome });
  } catch (e) {
    console.error('[sinalizar] POST erro:', (e as Error).message);
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
