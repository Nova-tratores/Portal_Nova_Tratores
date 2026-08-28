// GET  /api/frota/veiculos/[placa] — a Ficha completa (tudo dos espelhos locais)
// PATCH /api/frota/veiculos/[placa] — edita a ficha. Campo espelhado da Rota
//   Exata que for editado entra em `campos_manuais` — o sync nunca mais o toca
//   (o humano venceu). Permissão: frota:veiculos:editar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';
import { espelharProjetosOmie } from '@/lib/frota/supaplacas';
import { resolverPlaca, extrairPlacaDeNumPlaca } from '@/lib/frota/placa';
import { responsavelVazio, mesmaPessoa } from '@/lib/frota/responsavel';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// Campos que a Rota Exata espelha — editar um destes trava o campo contra o sync.
const ESPELHADOS = new Set([
  'descricao', 'cor', 'chassi', 'renavam', 'ano', 'ano_modelo', 'tipo_veiculo',
  'capacidade_tanque', 'numero_apolice', 'dt_aquisicao', 'tipo_negociacao',
]);
// Tudo que a Ficha deixa editar (whitelist — o resto é ignorado).
const EDITAVEIS = new Set([
  ...ESPELHADOS,
  'marca', 'modelo', 'combustivel', 'categoria', 'setor', 'status', 'ativo',
  'observacoes', 'seguradora', 'placa_exibicao', 'proprietario', 'equipamentos',
  'exercicio_crlv', 'id_projeto_omie', 'id_projeto_omie_castro',
  'fipe_codigo', 'fipe_ano_codigo', 'senha_cartao_veloe',
  // desligar o checklist mensal deste carro (motivo é opcional)
  'checklist_desativado', 'checklist_desativado_motivo',
]);

async function acharVeiculo(placaParam: string) {
  const placa = resolverPlaca(decodeURIComponent(placaParam));
  const { data } = await supabase.from('frota_veiculos').select('*').eq('placa', placa).maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { placa } = await params;
  const v = await acharVeiculo(placa);
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  const de12m = new Date();
  de12m.setMonth(de12m.getMonth() - 12);
  const de12mIso = de12m.toISOString().slice(0, 10);

  const de30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [resp, multas, manut, abast, custos, odo, foto, dias, documentos, chk] = await Promise.all([
    supabase
      .from('frota_responsaveis')
      .select('id, motorista_id, motorista_nome, inicio, fim, origem, obs')
      .eq('veiculo_id', v.id)
      .order('inicio', { ascending: false }),
    supabase.from('frota_multas').select('*').eq('veiculo_id', v.id).order('dt_multa', { ascending: false }),
    supabase.from('vw_frota_manutencoes').select('*').eq('veiculo_id', v.id).order('data', { ascending: false }).limit(50),
    supabase
      .from('abastecimentos')
      .select('data_transacao, litros, valor_total, combustivel, posto_nome, hodometro, motorista_nome')
      .eq('placa', v.placa)
      .order('data_transacao', { ascending: false })
      .limit(8),
    supabase.from('vw_frota_custos').select('tipo, valor').eq('veiculo_id', v.id).gte('data', de12mIso),
    supabase
      .from('frota_odometro')
      .select('km_adesao, km_rastreador, data')
      .eq('veiculo_id', v.id)
      .order('data', { ascending: false })
      .limit(1),
    v.id_placa != null
      ? supabase.from('Placas').select('imagem_url, valor_mercado, data_valor').eq('IdPlaca', v.id_placa).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase
      .from('frota_dias')
      .select('data, km_total, km_odometro, partidas, tempo_ligado_min, tempo_marcha_lenta_min, paradas_total, paradas_atipicas, posicoes_total')
      .eq('veiculo_id', v.id)
      .gte('data', de30)
      .order('data', { ascending: false }),
    supabase
      .from('frota_documentos')
      .select('*')
      .eq('veiculo_id', v.id)
      .order('vigencia_fim', { ascending: true, nullsFirst: false }),
    // Checklists mensais do veículo (feitos no NT Mecânico — mesmo Supabase).
    // A placa lá pode vir "MODELO - PLACA"; filtra por placa canônica no JS.
    supabase
      .from('veiculo_checklist')
      .select('id, tecnico_nome, placa, mes_referencia, status, score_confianca, km, share_token, inicio_em, fim_em, alertas')
      .gte('mes_referencia', de12m.toISOString().slice(0, 7))
      .order('mes_referencia', { ascending: false }),
  ]);

  // Casa checklist com o carro por DOIS caminhos (dedup por id):
  //   1) placa igual (caminho normal);
  //   2) feito pelo TÉCNICO que é o responsável atual do carro — cobre o caso do
  //      NT Mecânico gravar o checklist sob a placa cadastrada do técnico (que
  //      pode divergir da placa real do carro). Quando entra por esse caminho e
  //      a placa registrada é outra, guardo em `placa_registrada` p/ a ficha
  //      mostrar de onde veio.
  const respAtual = (resp.data || []).find((r) => r.fim === null && !responsavelVazio(r.motorista_nome)) || null;
  const porId = new Map<string, any>();
  for (const c of chk.data || []) {
    const placaChk = resolverPlaca(extrairPlacaDeNumPlaca(c.placa));
    const casaPlaca = placaChk === v.placa;
    const casaResp = !casaPlaca && respAtual != null && mesmaPessoa(c.tecnico_nome, respAtual.motorista_nome);
    if (!casaPlaca && !casaResp) continue;
    porId.set(c.id, {
      ...c,
      placa_registrada: casaPlaca ? null : (c.placa || null),
      vinculo: casaPlaca ? 'placa' : 'responsavel',
    });
  }
  const checklists = [...porId.values()];

  // custos 12m agregados por tipo (a view garante que cada real conta UMA vez)
  const porTipo = new Map<string, number>();
  for (const c of custos.data || []) {
    const t = c.tipo || 'Outros';
    porTipo.set(t, (porTipo.get(t) || 0) + (Number(c.valor) || 0));
  }
  const custos12m = [...porTipo.entries()]
    .map(([tipo, total]) => ({ tipo, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  const ultOdo = (odo.data || [])[0];

  // Hodômetro: rastreador primeiro; sem rastreador, vale o DIGITADO no último
  // abastecimento do cartão (o motorista informa na bomba)
  const kmRastreador = ultOdo ? Number(ultOdo.km_adesao ?? ultOdo.km_rastreador) || null : null;
  const kmDigitado = (abast.data || [])
    .map((a) => Number(a.hodometro))
    .find((h) => Number.isFinite(h) && h > 100) || null;

  // Uso & Ignição (30 dias) — só dias com telemetria
  const diasUso = (dias.data || []).filter((d) => (d.posicoes_total || 0) > 0);
  const uso_30d = {
    dias_com_uso: diasUso.length,
    partidas: diasUso.reduce((s, d) => s + (d.partidas || 0), 0),
    tempo_ligado_min: diasUso.reduce((s, d) => s + (d.tempo_ligado_min || 0), 0),
    tempo_marcha_lenta_min: diasUso.reduce((s, d) => s + (d.tempo_marcha_lenta_min || 0), 0),
    km: Math.round(diasUso.reduce((s, d) => s + Number(d.km_odometro ?? d.km_total ?? 0), 0)),
    paradas_atipicas: diasUso.reduce((s, d) => s + (d.paradas_atipicas || 0), 0),
    ultimos_dias: diasUso.slice(0, 7),
  };

  return NextResponse.json({
    veiculo: v,
    imagem_url: foto?.data?.imagem_url || null,
    // FIPE mora em Placas (o DRE lê valor_mercado de lá) — edição na Ficha via
    // /api/visual-estoque/frota/dados, identificando por id_placa.
    fipe: v.id_placa != null && foto?.data
      ? { valor_mercado: foto.data.valor_mercado ?? null, data_valor: foto.data.data_valor ?? null }
      : null,
    responsaveis: resp.data || [],
    multas: multas.data || [],
    manutencoes: manut.data || [],
    abastecimentos: abast.data || [],
    custos_12m: custos12m,
    km_odometro: kmRastreador ?? kmDigitado,
    km_odometro_fonte: kmRastreador != null ? 'rastreador' : kmDigitado != null ? 'digitado' : null,
    uso_30d,
    documentos: documentos.data || [],
    checklists,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ placa: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar veículos.' }, { status: 403 });
  }

  const { placa } = await params;
  const v = await acharVeiculo(placa);
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const upd: Record<string, unknown> = {};
  const travar: string[] = [];
  for (const [campo, valor] of Object.entries(body || {})) {
    if (!EDITAVEIS.has(campo)) continue;
    upd[campo] = valor === '' ? null : valor;
    if (ESPELHADOS.has(campo)) travar.push(campo);
  }
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
  }
  if (travar.length > 0) {
    upd.campos_manuais = [...new Set([...(v.campos_manuais || []), ...travar])];
  }

  // Ligar/desligar o checklist carimba quem e quando — a pergunta "por que este
  // carro parou de fazer checklist?" precisa ter resposta meses depois.
  if ('checklist_desativado' in upd) {
    const desligando = upd.checklist_desativado === true;
    upd.checklist_desativado = desligando;
    upd.checklist_desativado_em = desligando ? new Date().toISOString() : null;
    upd.checklist_desativado_por = desligando ? (auth.email || auth.userId || 'portal') : null;
    if (!desligando) upd.checklist_desativado_motivo = null;
  }

  const { error } = await supabase.from('frota_veiculos').update(upd).eq('id', v.id);
  if (error) {
    // migração pendente: aqui NÃO dá pra seguir em silêncio como nas leituras —
    // a pessoa clicou num botão e ficaria achando que desligou o checklist
    if (/checklist_desativado/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Falta aplicar a migração sql/frota-gravidade-e-checklist.sql no Supabase para desligar o checklist por veículo.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Projeto Omie editado? Espelha na SupaPlacas — é de lá que o
  // omie-contapagar resolve o projeto das requisições veiculares.
  if ('id_projeto_omie' in upd || 'id_projeto_omie_castro' in upd) {
    try {
      await espelharProjetosOmie(supabase, v, {
        ...('id_projeto_omie' in upd ? { id_projeto_omie: upd.id_projeto_omie == null ? null : Number(upd.id_projeto_omie) } : {}),
        ...('id_projeto_omie_castro' in upd ? { id_projeto_omie_castro: upd.id_projeto_omie_castro == null ? null : Number(upd.id_projeto_omie_castro) } : {}),
      });
    } catch (e) {
      // a ficha salvou; o espelho é re-tentável no próximo save
      console.error('[frota] espelho SupaPlacas falhou:', e);
      return NextResponse.json({ ok: true, aviso: 'Ficha salva, mas o espelho pro Omie (SupaPlacas) falhou — salve de novo.' });
    }
  }

  await logFrota(auth, {
    acao: 'editar',
    entidade: 'veiculo',
    entidadeId: v.placa,
    entidadeLabel: `${v.placa_exibicao || v.placa}${v.modelo ? ` · ${v.modelo}` : ''}`,
    // antes/depois só dos campos alterados — é o que o histórico precisa
    detalhes: {
      alterados: Object.fromEntries(
        Object.entries(upd)
          .filter(([k]) => k !== 'campos_manuais')
          .map(([k, novo]) => [k, { de: (v as Record<string, unknown>)[k] ?? null, para: novo }]),
      ),
      campos_travados: travar,
    },
  });

  return NextResponse.json({ ok: true, campos_travados: travar });
}
