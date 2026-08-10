// GET /api/frota/checklist-itens?id=<checklist_id>
// Itens (com foto) de um checklist mensal de veículo. Lê a tabela do NT Mecânico
// (mesmo Supabase). Carregado sob demanda quando o usuário expande na Ficha.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Passe ?id=<checklist>' }, { status: 400 });

  const { data, error } = await supabase
    .from('veiculo_checklist_itens')
    .select('id, item_key, categoria, titulo, resposta, observacao, foto_url, respondido_em')
    .eq('checklist_id', id)
    .order('respondido_em', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ itens: data || [] });
}
