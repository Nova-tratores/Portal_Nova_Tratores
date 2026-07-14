// GET /api/abastecimento/flex — comparador Álcool × Gasolina por veículo flex.
// Params: de, ate (YYYY-MM-DD; padrão últimos 12 meses), placa (opcional).
// Considera só abastecimentos de Etanol/Gasolina; km/l vem do hodômetro
// digitado (leituras implausíveis são descartadas — ver lib/abastecimento/flex).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { compararFlex, type FlexRow } from '@/lib/abastecimento/flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGINA = 1000;

export async function GET(req: NextRequest) {
  // Rodava com service role e sem autenticação nenhuma (ver dashboard/route.ts).
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'abastecimento')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const hoje = new Date();
    const umAnoAtras = new Date(hoje);
    umAnoAtras.setFullYear(hoje.getFullYear() - 1);
    const de = sp.get('de') || umAnoAtras.toISOString().slice(0, 10);
    const ate = sp.get('ate') || '';
    const placa = sp.get('placa') || '';

    const rows: FlexRow[] = [];
    for (let off = 0; ; off += PAGINA) {
      let q = supabase
        .from('abastecimentos')
        .select('placa, modelo_veiculo, combustivel, litros, valor_total, hodometro_anterior, hodometro')
        .gte('data_transacao', `${de}T00:00:00-03:00`)
        .or('combustivel.ilike.%etanol%,combustivel.ilike.%gasolina%,combustivel.ilike.%alcool%,combustivel.ilike.%álcool%');
      if (ate) q = q.lte('data_transacao', `${ate}T23:59:59-03:00`);
      if (placa) q = q.eq('placa', placa);
      const { data, error } = await q.order('data_transacao', { ascending: true }).range(off, off + PAGINA - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const l of data || []) {
        rows.push({
          placa: l.placa,
          modelo_veiculo: l.modelo_veiculo,
          combustivel: l.combustivel,
          litros: l.litros == null ? null : Number(l.litros),
          valor_total: l.valor_total == null ? null : Number(l.valor_total),
          hodometro_anterior: l.hodometro_anterior == null ? null : Number(l.hodometro_anterior),
          hodometro: l.hodometro == null ? null : Number(l.hodometro),
        });
      }
      if (!data || data.length < PAGINA) break;
    }

    return NextResponse.json({ de, ate: ate || null, veiculos: compararFlex(rows) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
