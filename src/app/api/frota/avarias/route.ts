// GET   /api/frota/avarias — lista as avarias/danos de veículo (mais recentes
//        primeiro). Qualquer pessoa com o módulo Frota vê.
// POST  /api/frota/avarias — registra uma avaria (permissão frota:avarias:editar).
// PATCH /api/frota/avarias — status / valor / motorista / obs (mesma permissão).
//        A cobrança em folha NÃO acontece aqui: o RH lê esta tabela, anexa o
//        desconto lá e espelha o status de volta (mesmo desenho das multas).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloFrota } from '@/lib/frota/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const STATUS_VALIDOS = new Set(['aberta', 'descontada', 'cobrada', 'absorvida', 'cancelada']);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { data, error } = await supabase
    .from('frota_avarias')
    .select('*')
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ avarias: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'avarias:editar')) {
    return NextResponse.json({ error: 'Sem permissão para registrar avarias.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const placa = String(body.placa || '').trim().toUpperCase();
  const data = String(body.data || '').slice(0, 10);
  const descricao = String(body.descricao || '').trim();
  const valor = Number(body.valor);
  if (!placa) return NextResponse.json({ error: 'Informe a placa.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Informe a data da avaria.' }, { status: 400 });
  }
  if (!descricao) return NextResponse.json({ error: 'Descreva a avaria.' }, { status: 400 });
  if (!Number.isFinite(valor) || valor < 0) {
    return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });
  }

  // veiculo_id pela placa (best-effort — placa avulsa fica sem vínculo)
  const { data: veic } = await supabase
    .from('frota_veiculos')
    .select('id')
    .eq('placa', placa)
    .maybeSingle();

  // motorista: id vindo do seletor; nome resolvido aqui (fonte da verdade)
  let motoristaNome: string | null = null;
  const motoristaId = body.motorista_id ? String(body.motorista_id) : null;
  if (motoristaId) {
    const { data: mot } = await supabase
      .from('frota_motoristas')
      .select('nome, pessoa_id')
      .eq('id', motoristaId)
      .maybeSingle();
    motoristaNome = mot?.nome ?? null;
    // pessoa_id já é o vínculo com o RH (de-para da aba Motoristas)
    if (mot?.pessoa_id) body.rh_funcionario_id = mot.pessoa_id;
  }

  const { data: nova, error } = await supabase
    .from('frota_avarias')
    .insert({
      veiculo_id: veic?.id ?? null,
      placa,
      data,
      descricao,
      valor,
      motorista_id: motoristaId,
      motorista_nome: motoristaNome,
      rh_funcionario_id: body.rh_funcionario_id ?? null,
      obs: String(body.obs || '').trim() || null,
      criado_por: auth.email ?? null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: 'editar',
    entidade: 'avaria',
    entidadeId: nova.id,
    entidadeLabel: `Avaria ${placa} · R$ ${valor.toFixed(2)} · ${descricao.slice(0, 60)}`,
    detalhes: { placa, data, valor, motorista: motoristaNome },
  });
  return NextResponse.json({ ok: true, id: nova.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'avarias:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar avarias.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'Informe o id da avaria.' }, { status: 400 });

  const upd: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUS_VALIDOS.has(String(body.status))) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    upd.status = body.status;
  }
  if (body.valor !== undefined) {
    const v = Number(body.valor);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });
    upd.valor = v;
  }
  if (body.descricao !== undefined) {
    const d = String(body.descricao).trim();
    if (!d) return NextResponse.json({ error: 'Descrição não pode ficar vazia.' }, { status: 400 });
    upd.descricao = d;
  }
  if (body.obs !== undefined) upd.obs = String(body.obs || '').trim() || null;
  if (body.motorista_id !== undefined) {
    upd.motorista_id = body.motorista_id || null;
    if (body.motorista_id) {
      const { data: mot } = await supabase
        .from('frota_motoristas')
        .select('nome, pessoa_id')
        .eq('id', String(body.motorista_id))
        .maybeSingle();
      upd.motorista_nome = mot?.nome ?? null;
      if (mot?.pessoa_id) upd.rh_funcionario_id = mot.pessoa_id;
    } else {
      upd.motorista_nome = null;
    }
  }
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
  }

  const { data: antes } = await supabase
    .from('frota_avarias')
    .select('placa, valor, status, descricao')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('frota_avarias').update(upd).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: upd.status !== undefined ? 'mover_status' : 'editar',
    entidade: 'avaria',
    entidadeId: id,
    entidadeLabel: antes
      ? `Avaria ${antes.placa} · R$ ${Number(antes.valor || 0).toFixed(2)}`
      : `Avaria ${id.slice(0, 8)}`,
    detalhes: {
      ...(upd.status !== undefined ? { status: { de: antes?.status ?? null, para: upd.status } } : {}),
      ...(upd.valor !== undefined ? { valor: { de: antes?.valor ?? null, para: upd.valor } } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
