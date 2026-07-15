// POST   /api/frota/veiculos/[placa]/arquivar — ARQUIVA o veículo (saída da
//        frota SEM venda: sucateado, devolvido, cadastro errado/duplicado...).
//        { motivo } → status='arquivado', ativo=false, com motivo e data.
//        Mesmo tratamento da venda: encerra o responsável aberto e desativa em
//        Placas (sai do patrimônio do DRE). A ficha fica de histórico.
// DELETE — desarquiva (volta a ativo).
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
  if (v.status === 'vendido') {
    return NextResponse.json({ error: 'Este veículo está VENDIDO — desfaça a venda antes de arquivar.' }, { status: 409 });
  }
  if (v.status === 'arquivado') {
    return NextResponse.json({ error: 'Este veículo já está arquivado.' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const motivo = String(body?.motivo || '').trim();
  if (!motivo) return NextResponse.json({ error: 'Informe o motivo do arquivamento.' }, { status: 400 });

  const hoje = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('frota_veiculos')
    .update({ status: 'arquivado', ativo: false, arquivado_motivo: motivo, arquivado_em: hoje })
    .eq('id', v.id);
  if (error) {
    const msg = /arquivado_motivo|arquivado_em|status.*check/i.test(error.message)
      ? 'Aplique a migração sql/frota-venda.sql no Supabase antes de arquivar.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // encerra o responsável em aberto (o período fica no histórico)
  await supabase.from('frota_responsaveis').update({ fim: hoje }).eq('veiculo_id', v.id).is('fim', null);

  // sai do patrimônio do DRE — best-effort
  let aviso: string | undefined;
  if (v.id_placa != null) {
    const { error: errPl } = await supabase.from('Placas').update({ ativo: false }).eq('IdPlaca', v.id_placa);
    if (errPl) aviso = `Arquivado, mas não consegui desativar em Placas (DRE): ${errPl.message}`;
  }

  await logFrota(auth, {
    acao: 'arquivar',
    entidade: 'veiculo',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa}${v.modelo ? ` · ${v.modelo}` : ''}`,
    detalhes: { motivo },
  });

  return NextResponse.json({ ok: true, ...(aviso ? { aviso } : {}) });
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
  if (v.status !== 'arquivado') return NextResponse.json({ error: 'Este veículo não está arquivado.' }, { status: 409 });

  const { error } = await supabase
    .from('frota_veiculos')
    .update({ status: 'ativo', ativo: true, arquivado_motivo: null, arquivado_em: null })
    .eq('id', v.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (v.id_placa != null) {
    await supabase.from('Placas').update({ ativo: true }).eq('IdPlaca', v.id_placa);
  }

  await logFrota(auth, {
    acao: 'desarquivar',
    entidade: 'veiculo',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa}${v.modelo ? ` · ${v.modelo}` : ''}`,
    detalhes: { motivo_anterior: v.arquivado_motivo },
  });

  return NextResponse.json({ ok: true });
}
