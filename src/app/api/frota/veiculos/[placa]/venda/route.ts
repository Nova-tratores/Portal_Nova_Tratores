// POST   /api/frota/veiculos/[placa]/venda — marca o veículo como VENDIDO.
//        { comprador, data, valor, obs } → status='vendido', ativo=false,
//        registro histórico preservado. Também: encerra o responsável aberto
//        (fim = data da venda) e desativa a linha em Placas → o carro SAI do
//        patrimônio do DRE (calc filtra ativo !== false).
// DELETE — desfaz uma venda marcada por engano (volta a ativo).
// Permissão: frota:veiculos:editar. Tudo com logFrota.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota } from '@/lib/frota/server';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

async function acharVeiculo(placaParam: string) {
  const placa = resolverPlaca(decodeURIComponent(placaParam));
  const { data } = await supabase.from('frota_veiculos').select('*').eq('placa', placa).maybeSingle();
  return data;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar veículos.' }, { status: 403 });
  }

  const { placa } = await params;
  const v = await acharVeiculo(placa);
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  if (v.status === 'vendido') return NextResponse.json({ error: 'Este veículo já está marcado como vendido.' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const comprador = String(body?.comprador || '').trim();
  const data = String(body?.data || '').trim();
  const valor = Number(String(body?.valor ?? '').replace(',', '.'));
  const obs = String(body?.obs || '').trim() || null;
  if (!comprador) return NextResponse.json({ error: 'Informe pra quem foi vendido.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: 'Data da venda inválida (YYYY-MM-DD).' }, { status: 400 });
  if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: 'Valor da venda inválido.' }, { status: 400 });

  const { error } = await supabase
    .from('frota_veiculos')
    .update({
      status: 'vendido',
      ativo: false,
      venda_data: data,
      venda_valor: valor,
      venda_comprador: comprador,
      venda_obs: obs,
    })
    .eq('id', v.id);
  if (error) {
    const msg = /venda_data|venda_valor|venda_comprador|equipamentos/.test(error.message)
      ? 'Aplique a migração sql/frota-venda.sql no Supabase antes de usar a venda.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // encerra o responsável em aberto (o período fica no histórico)
  await supabase
    .from('frota_responsaveis')
    .update({ fim: data })
    .eq('veiculo_id', v.id)
    .is('fim', null);

  // sai do patrimônio do DRE (Placas.ativo=false) — best-effort, avisa se falhar
  let avisoDre: string | undefined;
  if (v.id_placa != null) {
    const { error: errPl } = await supabase.from('Placas').update({ ativo: false }).eq('IdPlaca', v.id_placa);
    if (errPl) avisoDre = `Venda registrada, mas não consegui desativar em Placas (DRE): ${errPl.message}`;
  }

  await logFrota(auth, {
    acao: 'vender',
    entidade: 'veiculo',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa}${v.modelo ? ` · ${v.modelo}` : ''}`,
    detalhes: { comprador, data, valor, obs },
  });

  return NextResponse.json({ ok: true, ...(avisoDre ? { aviso: avisoDre } : {}) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar veículos.' }, { status: 403 });
  }

  const { placa } = await params;
  const v = await acharVeiculo(placa);
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  if (v.status !== 'vendido') return NextResponse.json({ error: 'Este veículo não está marcado como vendido.' }, { status: 409 });

  const { error } = await supabase
    .from('frota_veiculos')
    .update({ status: 'ativo', ativo: true, venda_data: null, venda_valor: null, venda_comprador: null, venda_obs: null })
    .eq('id', v.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (v.id_placa != null) {
    await supabase.from('Placas').update({ ativo: true }).eq('IdPlaca', v.id_placa);
  }

  await logFrota(auth, {
    acao: 'desfazer_venda',
    entidade: 'veiculo',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa}${v.modelo ? ` · ${v.modelo}` : ''}`,
    detalhes: { venda_anterior: { comprador: v.venda_comprador, data: v.venda_data, valor: v.venda_valor } },
  });

  return NextResponse.json({ ok: true });
}
