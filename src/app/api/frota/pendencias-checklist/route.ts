// GET /api/frota/pendencias-checklist
// Problemas apontados no CHECKLIST mais recente de cada veículo (itens com
// resposta "problema"). Alimenta a aba Frota > Pendências: pega só o último
// checklist por placa — se o problema foi resolvido no checklist seguinte,
// ele sai da lista sozinho.
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

  // Últimos 12 meses de checklists, mais novos primeiro → o primeiro de cada
  // placa é o checklist vigente daquele veículo.
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  const mesLimite = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const { data: checklists, error: e1 } = await supabase
    .from('veiculo_checklist')
    .select('id, placa, mes_referencia, fim_em')
    .gte('mes_referencia', mesLimite)
    .order('mes_referencia', { ascending: false });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const ultimoPorPlaca = new Map<string, { id: string; placa: string; mes_referencia: string }>();
  for (const c of checklists || []) {
    if (c.placa && !ultimoPorPlaca.has(c.placa)) ultimoPorPlaca.set(c.placa, c);
  }
  const ids = [...ultimoPorPlaca.values()].map((c) => c.id);
  if (ids.length === 0) return NextResponse.json({ problemas: [] });

  const { data: itens, error: e2 } = await supabase
    .from('veiculo_checklist_itens')
    .select('checklist_id, item_key, categoria, titulo, observacao, foto_url, respondido_em')
    .in('checklist_id', ids)
    .eq('resposta', 'problema');
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const infoPorId = new Map([...ultimoPorPlaca.values()].map((c) => [c.id, c]));
  const problemas = (itens || []).map((i) => {
    const c = infoPorId.get(i.checklist_id);
    return {
      placa: c?.placa || '',
      mes: c?.mes_referencia || '',
      item_key: i.item_key,
      categoria: i.categoria,
      titulo: i.titulo,
      observacao: i.observacao || '',
      foto_url: i.foto_url || null,
      respondido_em: i.respondido_em,
    };
  });

  return NextResponse.json({ problemas });
}
