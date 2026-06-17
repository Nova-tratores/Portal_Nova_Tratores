import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { invalidarIgnorarCache } from '@/lib/estoque/ignorar-clientes';
import type { Conta } from '@/lib/estoque/conta';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Remove um CNPJ ignorado por id. Portado de DELETE /api/ignorar-clientes/:id
// (server.js:7043).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idNum = parseInt(id, 10);
    if (!idNum) return NextResponse.json({ erro: 'id invalido' });
    const { data, error } = await supabase.from('ignorar_clientes').delete().eq('id', idNum).select();
    if (error) return NextResponse.json({ erro: error.message });
    if (data && data[0]) invalidarIgnorarCache((data[0] as { conta_omie?: Conta }).conta_omie);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
