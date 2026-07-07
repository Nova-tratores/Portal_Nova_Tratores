// GET /api/abastecimento/dashboard?de=YYYY-MM-DD&ate=YYYY-MM-DD&filial=&placa=
// Busca as linhas do período (paginado — PostgREST limita 1000/request) e
// agrega em JS (src/lib/abastecimento/agregacoes.ts).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { montarDashboard, type LinhaDash } from '@/lib/abastecimento/agregacoes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const COLS =
  'placa, id_placa, modelo_veiculo, filial_nome, motorista_nome, posto_nome, posto_cidade, combustivel, litros, valor_total, hodometro, data_transacao';

const PAGINA = 1000;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    // default: últimos 12 meses
    const hoje = new Date();
    const ate = sp.get('ate') || hoje.toISOString().slice(0, 10);
    const dePadrao = new Date(hoje);
    dePadrao.setFullYear(dePadrao.getFullYear() - 1);
    const de = sp.get('de') || dePadrao.toISOString().slice(0, 10);
    const filial = sp.get('filial') || '';
    const placa = sp.get('placa') || '';

    const linhas: LinhaDash[] = [];
    for (let off = 0; ; off += PAGINA) {
      let q = supabase
        .from('abastecimentos')
        .select(COLS)
        .gte('data_transacao', `${de}T00:00:00-03:00`)
        .lte('data_transacao', `${ate}T23:59:59-03:00`)
        .order('data_transacao', { ascending: true })
        .range(off, off + PAGINA - 1);
      if (filial) q = q.eq('filial_nome', filial);
      if (placa) q = q.eq('placa', placa);

      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const lote = (data || []) as unknown as LinhaDash[];
      for (const l of lote) linhas.push({ ...l, litros: Number(l.litros) || 0, valor_total: l.valor_total == null ? null : Number(l.valor_total), hodometro: l.hodometro == null ? null : Number(l.hodometro) });
      if (lote.length < PAGINA) break;
    }

    return NextResponse.json(montarDashboard(linhas, { de, ate }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
