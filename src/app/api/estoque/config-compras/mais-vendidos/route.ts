import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Aba "Mais Vendidos" (grade 7×7): top-49 do último snapshot por 3 métricas
// (quantidade 12m / faturamento 12m / demanda dessazonalizada), cada produto com
// o alerta (semáforo). Marca os SKUs que aparecem nas TRÊS listas.
const TOP = 49;
const CAMPOS = 'sku, descricao, tipo, curva, alerta, estoque_atual, minimo_efetivo, qtd_12m, faturamento_12m, cmd';

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'estoque');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  try {
    const ultimo = await supabase.from('sugestao_compra_snapshot')
      .select('snapshot_id, gerado_em').order('gerado_em', { ascending: false }).limit(1).maybeSingle();
    if (!ultimo.data) return NextResponse.json({ snapshot: null, quantidade: [], faturamento: [], demanda: [], intersecao: [] });
    const sid = ultimo.data.snapshot_id;

    const topPor = async (col: string) => {
      const { data } = await supabase.from('sugestao_compra_snapshot')
        .select(CAMPOS).eq('snapshot_id', sid).not(col, 'is', null).gt(col, 0)
        .order(col, { ascending: false }).limit(TOP);
      return (data ?? []) as unknown as Record<string, unknown>[];
    };
    const [quantidade, faturamento, demanda] = await Promise.all([
      topPor('qtd_12m'), topPor('faturamento_12m'), topPor('cmd'),
    ]);

    // interseção: SKUs presentes nas 3 listas
    const setQ = new Set(quantidade.map((r) => r.sku));
    const setF = new Set(faturamento.map((r) => r.sku));
    const intersecao = [...setQ].filter((s) => setF.has(s) && demanda.some((r) => r.sku === s));

    return NextResponse.json({ snapshot: { id: sid, gerado_em: ultimo.data.gerado_em }, quantidade, faturamento, demanda, intersecao });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
