// GET  /api/frota/planos  modelos de manutenção com os itens do plano e os veículos ligados
// POST /api/frota/planos  { acao: 'salvar_modelo', modelo, itens[], veiculos[] }
//
// O plano é por MODELO, com os intervalos do MANUAL (decisão do José). Item
// removido não é apagado (os serviços registrados apontam para ele): vira
// inativo. Escrita: quem edita a Ficha (frota:veiculos:editar).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const MSG_MIGRACAO = 'Falta aplicar sql/frota-preventiva.sql no Supabase.';
const semTabela = (m: string) => /frota_modelos_manutencao|frota_planos|modelo_manutencao_id|does not exist|schema cache/i.test(m);
const int = (x: unknown) => { const n = Number(String(x ?? '').replace(/\D/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const [modelos, itens, veics, comps] = await Promise.all([
    supabase.from('frota_modelos_manutencao').select('id, nome, manual_url, manual_referencia, obs').order('nome'),
    supabase.from('frota_planos').select('id, modelo_id, nome, componente_id, intervalo_km, intervalo_horas, intervalo_meses, aviso_km, aviso_horas, aviso_dias, modo, referencia, ordem')
      .eq('ativo', true).order('ordem').order('nome'),
    supabase.from('frota_veiculos').select('id, placa, marca, modelo, descricao, ano, ativo, status, tipo_registro, modelo_manutencao_id')
      .eq('tipo_registro', 'veiculo').order('placa'),
    supabase.from('frota_componentes').select('id, sistema, subsistema, componente').order('sistema'),
  ]);
  const erro = modelos.error || itens.error || veics.error;
  if (erro) {
    if (semTabela(erro.message)) return NextResponse.json({ migracaoFaltando: true, error: MSG_MIGRACAO, modelos: [], veiculos: [], componentes: comps.data || [] });
    return NextResponse.json({ error: erro.message }, { status: 500 });
  }
  const porModelo = new Map<string, unknown[]>();
  for (const i of itens.data || []) {
    const arr = porModelo.get(i.modelo_id) || [];
    arr.push(i); porModelo.set(i.modelo_id, arr);
  }
  return NextResponse.json({
    modelos: (modelos.data || []).map((m) => ({
      ...m,
      itens: porModelo.get(m.id) || [],
      veiculos: (veics.data || []).filter((v) => v.modelo_manutencao_id === m.id).map((v) => v.id),
    })),
    veiculos: (veics.data || []).filter((v) => v.ativo && v.status !== 'vendido'),
    componentes: comps.data || [],
    podeEditar: podeFrota(auth, 'veiculos:editar'),
  });
}

type ItemEntrada = {
  id?: string; nome?: string; componente_id?: string | null; intervalo_km?: unknown; intervalo_horas?: unknown; intervalo_meses?: unknown;
  aviso_km?: unknown; aviso_horas?: unknown; aviso_dias?: unknown; modo?: string; referencia?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) return NextResponse.json({ error: 'Só quem edita a Ficha cadastra planos.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.acao !== 'salvar_modelo') return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  const m = body.modelo || {};
  const nome = String(m.nome || '').trim();
  if (!nome) return NextResponse.json({ error: 'Dê um nome ao modelo (ex.: Fiat Strada Working 1.4 2024).' }, { status: 400 });

  const itens: ItemEntrada[] = Array.isArray(body.itens) ? body.itens : [];
  for (const i of itens) {
    if (!String(i.nome || '').trim()) return NextResponse.json({ error: 'Todo item precisa de um nome.' }, { status: 400 });
    if (!int(i.intervalo_km) && !int(i.intervalo_horas) && !int(i.intervalo_meses)) {
      return NextResponse.json({ error: `"${i.nome}": informe ao menos um intervalo (km, horas ou meses) do manual.` }, { status: 400 });
    }
  }
  const { data: usu } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();

  const dadosModelo = {
    nome,
    manual_url: m.manual_url ? String(m.manual_url) : null,
    manual_referencia: m.manual_referencia ? String(m.manual_referencia).slice(0, 500) : null,
    obs: m.obs ? String(m.obs).slice(0, 1000) : null,
    atualizado_em: new Date().toISOString(),
  };
  const salvo = m.id
    ? await supabase.from('frota_modelos_manutencao').update(dadosModelo).eq('id', String(m.id)).select('id').single()
    : await supabase.from('frota_modelos_manutencao').insert({ ...dadosModelo, criado_por: String(usu?.nome || auth.email || '') }).select('id').single();
  if (salvo.error) {
    if (semTabela(salvo.error.message)) return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
    if (salvo.error.code === '23505') return NextResponse.json({ error: `Já existe um modelo chamado "${nome}".` }, { status: 409 });
    return NextResponse.json({ error: salvo.error.message }, { status: 500 });
  }
  const modeloId = salvo.data.id as string;

  // itens: atualiza os que vieram com id, cria os novos, desativa os que saíram
  const { data: atuais } = await supabase.from('frota_planos').select('id').eq('modelo_id', modeloId).eq('ativo', true);
  const manter = new Set(itens.filter((i) => i.id).map((i) => String(i.id)));
  const sairam = (atuais || []).map((a) => a.id as string).filter((id) => !manter.has(id));
  if (sairam.length) await supabase.from('frota_planos').update({ ativo: false }).in('id', sairam);
  for (const [ordem, i] of itens.entries()) {
    const linha = {
      modelo_id: modeloId,
      nome: String(i.nome).trim().slice(0, 120),
      componente_id: i.componente_id || null,
      intervalo_km: int(i.intervalo_km), intervalo_horas: int(i.intervalo_horas), intervalo_meses: int(i.intervalo_meses),
      aviso_km: int(i.aviso_km) ?? 1000, aviso_horas: int(i.aviso_horas) ?? 25, aviso_dias: int(i.aviso_dias) ?? 30,
      modo: i.modo === 'fixo' ? 'fixo' : 'deslizante',
      referencia: i.referencia ? String(i.referencia).slice(0, 300) : null,
      ordem, ativo: true,
    };
    const r = i.id
      ? await supabase.from('frota_planos').update(linha).eq('id', String(i.id))
      : await supabase.from('frota_planos').insert(linha);
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  // veículos do modelo: liga os marcados, solta os que saíram
  const veiculos: string[] = Array.isArray(body.veiculos) ? body.veiculos.map(String) : [];
  await supabase.from('frota_veiculos').update({ modelo_manutencao_id: null }).eq('modelo_manutencao_id', modeloId)
    .not('id', 'in', `(${veiculos.length ? veiculos.map((x) => `"${x}"`).join(',') : '"00000000-0000-0000-0000-000000000000"'})`);
  if (veiculos.length) await supabase.from('frota_veiculos').update({ modelo_manutencao_id: modeloId }).in('id', veiculos);

  await logFrota(auth, {
    acao: m.id ? 'editar' : 'criar', entidade: 'plano_preventiva', entidadeId: modeloId,
    entidadeLabel: `Plano de preventiva: ${nome} (${itens.length} itens, ${veiculos.length} veículos)`,
    detalhes: { itens: itens.map((i) => i.nome), veiculos: veiculos.length, removidos: sairam.length },
  });
  return NextResponse.json({ ok: true, id: modeloId });
}
