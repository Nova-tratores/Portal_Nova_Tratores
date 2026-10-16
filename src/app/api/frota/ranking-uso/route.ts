// GET /api/frota/ranking-uso?de=YYYY-MM-DD&ate=YYYY-MM-DD — os dias de uso
// (km, tempo ligado, movimento, marcha lenta) de cada carro no período, de
// frota_dias. A agregação (veículo/motorista, dia/semana/mês) é feita na tela
// pela lib pura lib/frota/ranking-uso.ts.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import type { DiaUso } from '@/lib/frota/ranking-uso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

interface Linha {
  veiculo_id: string; placa: string; data: string; motorista_nome: string | null;
  km_total: number | null; km_odometro: number | null;
  tempo_ligado_min: number | null; tempo_movimento_min: number | null; tempo_marcha_lenta_min: number | null;
}

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'paradas')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const u = new URL(req.url);
  const de = u.searchParams.get('de') || '';
  const ate = u.searchParams.get('ate') || '';
  if (!DATA.test(de) || !DATA.test(ate) || de > ate) return NextResponse.json({ error: 'Período inválido' }, { status: 400 });

  const [r, v] = await Promise.all([
    paginar((a, b) => supabaseAdmin
      .from('frota_dias')
      .select('veiculo_id, placa, data, motorista_nome, km_total, km_odometro, tempo_ligado_min, tempo_movimento_min, tempo_marcha_lenta_min')
      .gte('data', de).lte('data', ate)
      .order('id')
      .range(a, b)),
    supabaseAdmin.from('frota_veiculos').select('id, placa, marca, modelo, descricao'),
  ]);
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });

  const veic = new Map<string, { placa: string; modelo: string | null }>();
  for (const x of (v.data || []) as { id: string; placa: string; marca: string | null; modelo: string | null; descricao: string | null }[]) {
    veic.set(x.id, { placa: x.placa, modelo: [x.marca, x.modelo].filter(Boolean).join(' ') || x.descricao || null });
  }

  const dias: DiaUso[] = (r.data as unknown as Linha[]).map((l) => {
    const vv = veic.get(l.veiculo_id);
    return {
      veiculo_id: l.veiculo_id,
      placa: (vv?.placa || l.placa || '').replace(/CANCELADO$/i, ''),
      modelo: vv?.modelo ?? null,
      data: l.data,
      motorista_nome: l.motorista_nome,
      km: Number(l.km_odometro ?? l.km_total) || 0,
      ligado_min: Number(l.tempo_ligado_min) || 0,
      movimento_min: Number(l.tempo_movimento_min) || 0,
      lenta_min: Number(l.tempo_marcha_lenta_min) || 0,
    };
  });
  const { data: ultimo } = await supabaseAdmin.from('frota_dias').select('data').order('data', { ascending: false }).limit(1);
  return NextResponse.json({ dias, ultimoDia: ultimo?.[0]?.data ?? null });
}
