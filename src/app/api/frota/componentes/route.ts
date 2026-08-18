// GET /api/frota/componentes — taxonomia veicular (sistema > subsistema >
// componente) com a vida útil esperada. Alimenta os selects da tela de
// Pendências. Seed em sql/frota-pendencias.sql.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloPendencias } from '@/lib/frota/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloPendencias(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { data, error } = await supabase
    .from('frota_componentes')
    .select('id, sistema, subsistema, componente, vida_util_meses, vida_util_km, ordem')
    .order('ordem', { ascending: true });

  if (error) {
    const faltaTabela = /relation .* does not exist/i.test(error.message);
    return NextResponse.json(
      { error: faltaTabela ? 'Tabelas de pendências ainda não criadas — aplique sql/frota-pendencias.sql no Supabase.' : error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ componentes: data || [] });
}
