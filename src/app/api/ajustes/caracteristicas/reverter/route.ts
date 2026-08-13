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

// WRITE no Omie: reverte uma edição de característica registrada no audit_log —
// regrava na Omie o valor ANTERIOR (detalhes.de) e audita como acao='reverter'.
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (!auth) return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { logId?: number | string };
    const logId = body.logId;
    if (logId == null) return NextResponse.json({ ok: false, erro: 'informe logId' }, { status: 400 });

    const { data: log, error } = await supabase
      .from('audit_log')
      .select('detalhes')
      .eq('id', logId)
      .eq('sistema', 'caracteristicas')
      .maybeSingle();
    if (error) throw error;
    if (!log) return NextResponse.json({ ok: false, erro: 'registro não encontrado' }, { status: 404 });

    const d = (log as any).detalhes || {};
    const { empresa, codigo_produto, caracteristica, de } = d;
    if (!empresa || codigo_produto == null || !caracteristica) {
      return NextResponse.json({ ok: false, erro: 'registro sem dados suficientes para reverter' }, { status: 400 });
    }

    const { data: perfil } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    const autor = { userId: auth.userId, userName: perfil?.nome || auth.email || '—' };

    // Regrava o valor anterior (de). Gera novo audit_log com acao='reverter'.
    const r = await editarCaractProduto(empresa, codigo_produto, caracteristica, de ?? '', autor, 'reverter');
    return NextResponse.json({ ok: true, valor: r.conteudo });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
