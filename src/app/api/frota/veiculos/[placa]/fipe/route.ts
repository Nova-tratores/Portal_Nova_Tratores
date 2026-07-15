// GET /api/frota/veiculos/[placa]/fipe — consulta o valor FIPE do veículo.
//
// Com fipe_codigo já confirmado: consulta DIRETA (determinística). Sem: fuzzy
// pela marca/modelo/ano da ficha, devolvendo confiança + candidatos — o
// humano confere na Ficha e, ao salvar, o código fica gravado pro cron mensal.
// NADA é salvo aqui — consulta pura. Permissão: frota:veiculos:editar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { buscarFipePorCodigo, buscarFipePorDescricao } from '@/lib/frota/fipe';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar veículos.' }, { status: 403 });
  }

  const { placa } = await params;
  const { data: v } = await supabase
    .from('frota_veiculos')
    .select('marca, modelo, descricao, ano, ano_modelo, fipe_codigo, fipe_ano_codigo')
    .eq('placa', resolverPlaca(decodeURIComponent(placa)))
    .maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  try {
    const resultado = v.fipe_codigo && v.fipe_ano_codigo
      ? await buscarFipePorCodigo(v.fipe_codigo, v.fipe_ano_codigo)
      : await buscarFipePorDescricao({
          marca: v.marca,
          modelo: v.modelo || v.descricao,
          ano: v.ano,
          ano_modelo: v.ano_modelo,
        });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
