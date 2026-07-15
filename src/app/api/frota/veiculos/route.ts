// GET  /api/frota/veiculos — a frota inteira, com responsável atual, foto e
//      resumo de multas. Tudo local (espelhos) — nenhuma chamada à Rota Exata.
// POST /api/frota/veiculos — cadastra um veículo NOVO (o Frota é o único lugar
//      de cadastro desde a Fase 5) e cria a linha-espelho na SupaPlacas, que
//      as Requisições e o Omie consomem. Permissão: frota:veiculos:editar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';
import { garantirSupaPlaca } from '@/lib/frota/supaplacas';
import { PLACA_RE, resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const de7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [veiculos, responsaveis, placasFoto, multas, docs, dias7] = await Promise.all([
    supabase.from('frota_veiculos').select('*').order('placa'),
    supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome').is('fim', null),
    supabase.from('Placas').select('IdPlaca, imagem_url'),
    supabase
      .from('frota_multas')
      .select('veiculo_id, valor, status_interno')
      .not('status_interno', 'in', '("paga","descontada","arquivada")'),
    supabase.from('frota_documentos').select('veiculo_id, vigencia_fim').not('vigencia_fim', 'is', null),
    // paradas atípicas na última semana (KPI da Visão geral)
    supabase.from('frota_dias').select('paradas_atipicas').gte('data', de7),
  ]);
  if (veiculos.error) return NextResponse.json({ error: veiculos.error.message }, { status: 500 });

  const respPorVeiculo = new Map<string, string>();
  for (const r of responsaveis.data || []) {
    if (r.motorista_nome) respPorVeiculo.set(r.veiculo_id, r.motorista_nome);
  }
  const fotoPorIdPlaca = new Map<number, string>();
  for (const p of placasFoto.data || []) {
    if (p.imagem_url) fotoPorIdPlaca.set(Number(p.IdPlaca), p.imagem_url);
  }
  const multasPorVeiculo = new Map<string, { n: number; total: number }>();
  for (const m of multas.data || []) {
    if (!m.veiculo_id) continue;
    const e = multasPorVeiculo.get(m.veiculo_id) || { n: 0, total: 0 };
    e.n++;
    e.total += Number(m.valor) || 0;
    multasPorVeiculo.set(m.veiculo_id, e);
  }

  // documentos vencidos ou vencendo em ≤30 dias (o alerta vai no card)
  const limite = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const docsVencendo = new Map<string, number>();
  for (const d of docs.data || []) {
    if (String(d.vigencia_fim) <= limite) {
      docsVencendo.set(d.veiculo_id, (docsVencendo.get(d.veiculo_id) || 0) + 1);
    }
  }

  const lista = (veiculos.data || []).map((v) => ({
    ...v,
    imagem_url: v.id_placa != null ? fotoPorIdPlaca.get(Number(v.id_placa)) || null : null,
    responsavel_nome: respPorVeiculo.get(v.id) || null,
    multas_abertas: multasPorVeiculo.get(v.id)?.n || 0,
    valor_multas_abertas: multasPorVeiculo.get(v.id)?.total || 0,
    docs_vencendo: docsVencendo.get(v.id) || 0,
  }));

  return NextResponse.json({
    veiculos: lista,
    resumo: {
      atipicas_7d: (dias7.data || []).reduce((s, d) => s + (d.paradas_atipicas || 0), 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar veículos.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const placaBruta = String(body?.placa || '').trim();
  const placa = resolverPlaca(placaBruta);
  if (!PLACA_RE.test(placa)) {
    return NextResponse.json({ error: `Placa inválida: "${placaBruta}" (esperado ABC-1234 ou ABC1D23).` }, { status: 400 });
  }

  const { data: existente } = await supabase
    .from('frota_veiculos')
    .select('id, placa_exibicao, ativo')
    .eq('placa', placa)
    .maybeSingle();
  if (existente) {
    return NextResponse.json(
      { error: `A placa ${existente.placa_exibicao || placa} já está cadastrada${existente.ativo ? '' : ' (inativa — reative pela Ficha)'}.` },
      { status: 409 },
    );
  }

  const txt = (k: string) => (typeof body?.[k] === 'string' && body[k].trim() ? String(body[k]).trim() : null);
  const ano = Number(body?.ano);
  const { data: novo, error } = await supabase
    .from('frota_veiculos')
    .insert({
      placa,
      placa_exibicao: placaBruta.toUpperCase(),
      tipo_registro: 'veiculo',
      origem_cadastro: 'portal',
      marca: txt('marca'),
      modelo: txt('modelo'),
      ano: Number.isFinite(ano) && ano > 1950 ? ano : null,
      cor: txt('cor'),
      combustivel: txt('combustivel'),
      categoria: txt('categoria') || 'outros',
      proprietario: txt('proprietario'),
      observacoes: txt('observacoes'),
      ativo: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // espelho pras Requisições/Omie — se falhar, o veículo existe mas sem
  // vínculo; a Ficha regenera no próximo save de projeto Omie
  let supaPlacaId: number | null = null;
  try { supaPlacaId = await garantirSupaPlaca(supabase, novo); } catch (e) {
    console.error('[frota] criar veículo: espelho SupaPlacas falhou:', e);
  }

  await logFrota(auth, {
    acao: 'criar',
    entidade: 'veiculo',
    entidadeId: novo.placa,
    entidadeLabel: `${novo.placa_exibicao || novo.placa}${novo.modelo ? ` · ${novo.modelo}` : ''}`,
    detalhes: { origem: 'portal', supa_placa_id: supaPlacaId },
  });

  return NextResponse.json({ ok: true, veiculo: { ...novo, supa_placa_id: supaPlacaId } });
}
