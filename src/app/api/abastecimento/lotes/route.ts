// GET /api/abastecimento/lotes — lista os uploads (mais recentes primeiro).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  // Rodava com service role e sem autenticação nenhuma. Os lotes mostram quem
  // importou e o período — só quem mexe no upload precisa ver.
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'abastecimento')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('abastecimento_lotes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lotes: data || [] });
}
