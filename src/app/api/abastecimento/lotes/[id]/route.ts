// DELETE /api/abastecimento/lotes/[id] — exclui um lote de upload inteiro
// (cascade apaga os abastecimentos dele). Restrito a admin/dev.
//
// Nota: como o padrão do portal é autorização client-side, aqui validamos o
// is_admin/is_dev do usuario_id DECLARADO pelo cliente em portal_permissoes —
// mesmo nível das demais rotas destrutivas. Hardening real (validar o JWT do
// Supabase no header Authorization) fica como melhoria futura.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idNum = parseInt(id, 10);
    if (!idNum) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const usuarioId = body?.usuario_id as string | undefined;
    if (!usuarioId) return NextResponse.json({ error: 'usuario_id obrigatório' }, { status: 400 });

    const { data: perm } = await supabase
      .from('portal_permissoes')
      .select('is_admin, is_dev')
      .eq('user_id', usuarioId)
      .maybeSingle();
    if (!perm?.is_admin && !perm?.is_dev) {
      return NextResponse.json({ error: 'Apenas administradores podem excluir lotes.' }, { status: 403 });
    }

    const { error } = await supabase.from('abastecimento_lotes').delete().eq('id', idNum);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
