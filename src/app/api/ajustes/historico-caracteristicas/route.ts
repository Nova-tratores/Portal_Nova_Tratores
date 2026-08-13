import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

// Service role: audit_log tem RLS; leitura server-side.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Histórico de edições de características (audit_log, sistema='caracteristicas').
// Para o gerente supervisionar quem alterou o quê. conta/produto opcionais.
export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const conta = (sp.get('conta') || '').trim().toUpperCase();
  const produto = (sp.get('produto') || '').trim();

  try {
    let q = supabase
      .from('audit_log')
      .select('id, user_id, user_nome, acao, entidade_label, detalhes, created_at')
      .eq('sistema', 'caracteristicas')
      .order('created_at', { ascending: false })
      .limit(500);
    if (conta === 'NOVA' || conta === 'CASTRO') q = q.eq('detalhes->>empresa', conta);
    if (produto) q = q.eq('detalhes->>codigo', produto);

    const { data, error } = await q;
    if (error) throw error;

    const linhas = (data || []).map((r: any) => {
      const d = r.detalhes || {};
      return {
        id: r.id,
        criado_em: r.created_at,
        criado_por: r.user_nome || '',
        acao: r.acao || 'editar',
        empresa: d.empresa || '',
        codigo_produto: d.codigo_produto ?? null,
        codigo: d.codigo ?? null,
        descricao: d.descricao ?? null,
        caracteristica: d.caracteristica ?? '',
        de: d.de ?? '',
        para: d.para ?? '',
      };
    });
    return NextResponse.json({ linhas });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
