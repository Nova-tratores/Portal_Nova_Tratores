// POST /api/frota/geocercas — cria uma geocerca DO PORTAL a partir de uma
// parada recorrente ("a casa do motorista", "o estacionamento do centro"...).
// É assim que a lista de atípicas encolhe sozinha: o lugar vira cadastro.
//
// Além de criar, ABSOLVE retroativamente as paradas atípicas já gravadas
// dentro do raio (classe/destino/atipica) e corrige os contadores em
// frota_dias — o fechar-dia dos próximos dias já classifica sozinho.
//
// Permissão: frota:paradas:justificar (é quem cura as paradas).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import { distanciaKm } from '@/lib/pos/rastreamento';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CLASSES = new Set(['cliente', 'loja', 'manutencao', 'estacionamento', 'descarga', 'outro']);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'paradas:justificar')) {
    return NextResponse.json({ error: 'Sem permissão para curar paradas/geocercas.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome || '').trim();
  const classe = String(body?.classe || 'outro').trim().toLowerCase();
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const raio_m = Math.min(5000, Math.max(100, Number(body?.raio_m) || 300));

  if (!nome) return NextResponse.json({ error: 'Informe o nome do local.' }, { status: 400 });
  if (!CLASSES.has(classe)) {
    return NextResponse.json({ error: `Classe inválida (${[...CLASSES].join(' | ')}).` }, { status: 400 });
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !latitude || !longitude) {
    return NextResponse.json({ error: 'Coordenadas inválidas.' }, { status: 400 });
  }

  const { data: geocerca, error } = await supabase
    .from('frota_geocercas')
    .insert({ nome, classe, latitude, longitude, raio_m, origem: 'portal', ativo: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Absolvição retroativa: toda parada ATÍPICA dentro do raio vira a classe do
  // novo local. (Paradas já classificadas em outro lugar ficam como estão.)
  const { data: atipicas } = await supabase
    .from('frota_paradas')
    .select('id, veiculo_id, data, latitude, longitude')
    .eq('atipica', true);
  const raioKm = raio_m / 1000;
  const afetadas = (atipicas || []).filter(
    (p) => p.latitude && p.longitude && distanciaKm(p.latitude, p.longitude, latitude, longitude) <= raioKm,
  );

  if (afetadas.length > 0) {
    const { error: errUpd } = await supabase
      .from('frota_paradas')
      .update({
        classe: classe === 'outro' ? 'outro_destino' : classe,
        geocerca_id: geocerca.id,
        destino_nome: nome,
        atipica: false,
      })
      .in('id', afetadas.map((p) => p.id));
    if (errUpd) {
      return NextResponse.json({ ok: true, geocerca, paradas_absolvidas: 0, aviso: `Geocerca criada, mas a absolvição do histórico falhou: ${errUpd.message}` });
    }

    // contadores de frota_dias (paradas_atipicas) — corrige por (veículo, dia)
    const porDia = new Map<string, number>();
    for (const p of afetadas) {
      const k = `${p.veiculo_id}|${p.data}`;
      porDia.set(k, (porDia.get(k) || 0) + 1);
    }
    for (const [k, n] of porDia) {
      const [veiculo_id, data] = k.split('|');
      const { data: dia } = await supabase
        .from('frota_dias')
        .select('paradas_atipicas, paradas_cliente, paradas_loja')
        .eq('veiculo_id', veiculo_id)
        .eq('data', data)
        .maybeSingle();
      if (!dia) continue;
      await supabase
        .from('frota_dias')
        .update({
          paradas_atipicas: Math.max(0, (dia.paradas_atipicas || 0) - n),
          ...(classe === 'cliente' ? { paradas_cliente: (dia.paradas_cliente || 0) + n } : {}),
          ...(classe === 'loja' ? { paradas_loja: (dia.paradas_loja || 0) + n } : {}),
        })
        .eq('veiculo_id', veiculo_id)
        .eq('data', data);
    }
  }

  await logFrota(auth, {
    acao: 'criar',
    entidade: 'geocerca',
    entidadeId: geocerca.id,
    entidadeLabel: `${nome} (${classe}, ${raio_m}m)`,
    detalhes: { latitude, longitude, raio_m, paradas_absolvidas: afetadas.length },
  });

  return NextResponse.json({ ok: true, geocerca, paradas_absolvidas: afetadas.length });
}
