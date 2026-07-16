// GET /api/abastecimento/flex — comparador Álcool × Gasolina por veículo flex.
// Params: de, ate (YYYY-MM-DD; padrão últimos 12 meses), placa (opcional),
//         detalhe=1 (com placa: devolve TODOS os abastecimentos anotados pela
//         MESMA régua do veredito — válido/descartado e por quê).
// Cada veículo também sai com o status do Frota (ativo/vendido/arquivado) —
// a tela esconde os fora da frota por padrão.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { avaliarKmL, classificarCombustivel, compararFlex, type FlexRow } from '@/lib/abastecimento/flex';
import { resolverPlaca } from '@/lib/frota/placa';

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
    const querDetalhe = sp.get('detalhe') === '1' && !!placa;

    const brutos: Record<string, unknown>[] = [];
    for (let off = 0; ; off += PAGINA) {
      let q = supabase
        .from('abastecimentos')
        .select('placa, modelo_veiculo, combustivel, litros, valor_total, hodometro_anterior, hodometro, data_transacao, posto_nome, motorista_nome')
        .gte('data_transacao', `${de}T00:00:00-03:00`)
        .or('combustivel.ilike.%etanol%,combustivel.ilike.%gasolina%,combustivel.ilike.%alcool%,combustivel.ilike.%álcool%');
      if (ate) q = q.lte('data_transacao', `${ate}T23:59:59-03:00`);
      if (placa) q = q.eq('placa', placa);
      const { data, error } = await q.order('data_transacao', { ascending: true }).range(off, off + PAGINA - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      brutos.push(...(data || []));
      if (!data || data.length < PAGINA) break;
    }

    const rows: FlexRow[] = brutos.map((l) => ({
      placa: String(l.placa),
      modelo_veiculo: (l.modelo_veiculo as string) ?? null,
      combustivel: (l.combustivel as string) ?? null,
      litros: l.litros == null ? null : Number(l.litros),
      valor_total: l.valor_total == null ? null : Number(l.valor_total),
      hodometro_anterior: l.hodometro_anterior == null ? null : Number(l.hodometro_anterior),
      hodometro: l.hodometro == null ? null : Number(l.hodometro),
    }));

    // status no Frota (ativo / vendido / arquivado) — a tela esconde os fora
    // da frota por padrão; placa que o Frota não conhece fica como ativa
    const { data: frota } = await supabase
      .from('frota_veiculos')
      .select('placa, ativo, status')
      .eq('tipo_registro', 'veiculo');
    const statusPorPlaca = new Map<string, { ativo: boolean; status: string }>();
    for (const f of frota || []) statusPorPlaca.set(f.placa, { ativo: !!f.ativo, status: f.status });

    const veiculos = compararFlex(rows).map((v) => {
      const st = statusPorPlaca.get(resolverPlaca(v.placa));
      return { ...v, ativo: st?.ativo ?? true, status_frota: st?.status ?? null };
    });

    // detalhe: TODOS os abastecimentos da placa, anotados pela MESMA régua
    const detalhe = querDetalhe
      ? brutos
          .map((l, i) => {
            const av = avaliarKmL(rows[i]);
            const litros = Number(l.litros) || 0;
            const valor = Number(l.valor_total) || 0;
            return {
              data: l.data_transacao,
              combustivel: classificarCombustivel(l.combustivel as string),
              combustivel_texto: l.combustivel,
              litros,
              valor,
              preco_litro: litros > 0 ? valor / litros : null,
              hodometro_anterior: l.hodometro_anterior == null ? null : Number(l.hodometro_anterior),
              hodometro: l.hodometro == null ? null : Number(l.hodometro),
              km: av.km,
              kml: av.kml,
              valido: av.valido,
              motivo: av.motivo,
              posto: (l.posto_nome as string) ?? null,
              motorista: (l.motorista_nome as string) ?? null,
            };
          })
          .filter((d) => d.combustivel) // diesel/arla ficam fora, como no veredito
          .reverse() // mais recente primeiro
      : undefined;

    return NextResponse.json({ de, ate: ate || null, veiculos, ...(detalhe ? { detalhe } : {}) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
