// DELETE /api/abastecimento/lotes/[id] — exclui um lote de upload inteiro
// (cascade apaga os abastecimentos dele). Restrito a admin/dev, validado
// pelo JWT do chamador (padrão de segurança do portal: src/lib/auth/server.ts).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exigirAdmin } from '@/lib/auth/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await exigirAdmin(req);
    if (!auth) {
      return NextResponse.json({ error: 'Apenas administradores podem excluir lotes.' }, { status: 403 });
    }

    const { id } = await params;
    const idNum = parseInt(id, 10);
    if (!idNum) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

    const { error } = await supabase.from('abastecimento_lotes').delete().eq('id', idNum);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
