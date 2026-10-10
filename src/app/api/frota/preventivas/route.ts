// GET  /api/frota/preventivas[?placa=]  situação da preventiva de cada veículo
// POST /api/frota/preventivas  { placa, plano_ids[], data, km?, horas?, obs? }
//      registra que o serviço FOI FEITO (ou "informar a última vez") — é o que
//      reinicia a contagem do item. Pode registrar: quem edita a Ficha ou o
//      pós-vendas (quem move a OS, decisão do José).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';
import { ehPosVendas } from '@/lib/assistente/notificados';
import { calcularPreventivas } from '@/lib/frota/preventiva-server';
import { resolverPlaca } from '@/lib/frota/placa';
import { sincronizarPendencias } from '@/lib/frota/pendencias-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const MSG_MIGRACAO = 'Falta aplicar sql/frota-preventiva.sql no Supabase.';

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  try {
    const bruta = req.nextUrl.searchParams.get('placa');
    const r = await calcularPreventivas(supabase, bruta ? { placas: [resolverPlaca(bruta)] } : {});
    if (!r.tabela) return NextResponse.json({ migracaoFaltando: true, error: MSG_MIGRACAO, veiculos: [], semPlano: [], resumo: r.resumo });
    return NextResponse.json({
      resumo: r.resumo,
      semPlano: r.veiculos.filter((v) => !v.modelo).map((v) => v.placa),
      veiculos: r.veiculos.map((v) => ({
        veiculo_id: v.veiculo_id, placa: v.placa, descricao: v.descricao, modelo: v.modelo,
        km: v.km ? { km: v.km.resultado.km, selo: v.km.resultado.selo, descricao: v.km.resultado.descricao } : null,
        itens: v.itens,
      })),
      podeRegistrar: podeFrota(auth, 'veiculos:editar') || ehPosVendas(auth),
      podePlanos: podeFrota(auth, 'veiculos:editar'),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth) || !(podeFrota(auth, 'veiculos:editar') || ehPosVendas(auth))) {
    return NextResponse.json({ error: 'Só quem edita a Ficha ou o pós-vendas registra serviço.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const placa = resolverPlaca(String(body.placa || ''));
  const planoIds: string[] = (Array.isArray(body.plano_ids) ? body.plano_ids : [body.plano_id]).map((x: unknown) => String(x || '')).filter(Boolean);
  const data = String(body.data || '').slice(0, 10);
  const km = body.km != null && String(body.km).trim() !== '' ? Number(String(body.km).replace(/\D/g, '')) : null;
  const horas = body.horas != null && String(body.horas).trim() !== '' ? Number(body.horas) : null;
  if (!placa || !planoIds.length) return NextResponse.json({ error: 'Informe o veículo e o item.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: 'Data inválida (não pode ser no futuro).' }, { status: 400 });
  }

  const { data: v } = await supabase.from('frota_veiculos').select('id, placa').eq('placa', placa).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  const { data: usu } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  const quem = String(usu?.nome || auth.email || auth.userId);

  const linhas = planoIds.map((plano_id) => ({
    veiculo_id: v.id, placa, plano_id, data, km, horas_motor: horas,
    origem: 'manual', obs: body.obs ? String(body.obs).slice(0, 500) : null, criado_por: quem,
  }));
  const { error } = await supabase.from('frota_servicos').insert(linhas);
  if (error) {
    if (/frota_servicos|does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logFrota(auth, {
    acao: 'criar', entidade: 'servico_preventiva', entidadeId: placa,
    entidadeLabel: `Preventiva ${placa}: ${planoIds.length} item(ns) feito(s) em ${data}${km ? ` com ${km.toLocaleString('pt-BR')} km` : ''}`,
    detalhes: { placa, plano_ids: planoIds, data, km, horas },
  });
  // fecha na hora a pendência "Preventiva: …" que este serviço resolve
  sincronizarPendencias().catch(() => {});
  return NextResponse.json({ ok: true, registrados: linhas.length });
}
