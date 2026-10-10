// GET /api/frota/custos?meses=12 — TCO por veículo, calculado no SERVIDOR.
// Antes a tela fazia 5 buscas paginadas no navegador (até 20 mil linhas) e
// ficava presa em "Carregando…". A conta é a função pura montarTco
// (src/lib/frota/custos.ts); aqui só se lê.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { paginar } from '@/lib/db/paginar';
import { montarTco, type EntradaCusto } from '@/lib/frota/custos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// requisições que são do veículo (as mesmas que a vw_frota_custos considera)
const TIPOS_REQ_VEICULO = ['Veicular Manutenção', 'Veicular Abastecimento', 'Frota-Veículos', 'Frota-Veiculos', 'Serviço de Terceiros'];

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'custos')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const meses = Math.min(36, Math.max(1, Number(req.nextUrl.searchParams.get('meses')) || 12));
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  const de = d.toISOString().slice(0, 10);

  // descricao chegou na view v3.1 e ref_id na v3.2 — se a migração não rodou,
  // cai pro select anterior em vez de derrubar a tela
  const lerCustos = async () => {
    for (const cols of ['veiculo_id, tipo, valor, data, fonte, descricao, ref_id', 'veiculo_id, tipo, valor, data, fonte, descricao', 'veiculo_id, tipo, valor, data, fonte']) {
      // view não tem id: ordena por TODAS as colunas lidas, senão o .range()
      // repete/pula linhas na virada da página
      const r = await paginar((a, b) => {
        let q = supabase.from('vw_frota_custos').select(cols).gte('data', de);
        for (const c of cols.split(', ')) q = q.order(c, { nullsFirst: true });
        return q.range(a, b);
      });
      if (!r.error) return r;
      if (!/column|coluna/i.test(r.error.message)) return r;
    }
    return { data: [], error: { message: 'vw_frota_custos sem as colunas esperadas' } };
  };

  try {
    const [veic, custos, dias, abastHod, reqsHod] = await Promise.all([
      supabase.from('frota_veiculos').select('id, placa, modelo, descricao, marca, tem_rastreador, tipo_registro, ativo, status, supa_placa_id, categoria'),
      lerCustos(),
      paginar((a, b) => supabase.from('frota_dias').select('id, veiculo_id, km_total, km_odometro').gte('data', de).order('id').range(a, b)),
      // hodômetro DIGITADO nos abastecimentos do cartão (pro km dos sem rastreador)
      paginar((a, b) => supabase.from('abastecimentos').select('id, placa, hodometro').gte('data_transacao', de).order('id').range(a, b)),
      // idem nas requisições do veículo (Requisicao.veiculo = SupaPlacas.IdPlaca)
      paginar((a, b) => supabase.from('Requisicao').select('id, veiculo, hodometro')
        .in('tipo', TIPOS_REQ_VEICULO).neq('status', 'lixeira').not('veiculo', 'is', null)
        .gte('data', de).order('id').range(a, b)),
    ]);
    for (const r of [veic, custos, dias, abastHod, reqsHod]) {
      if (r.error) throw new Error(r.error.message);
    }
    const entradas = custos.data as unknown as EntradaCusto[];
    const linhas = montarTco({
      veiculos: veic.data || [],
      custos: entradas,
      dias: dias.data as never[],
      hodAbastecimentos: abastHod.data as never[],
      hodRequisicoes: reqsHod.data as never[],
    });
    return NextResponse.json({ de, linhas, entradas });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
