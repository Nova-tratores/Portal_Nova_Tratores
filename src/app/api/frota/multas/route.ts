// GET   /api/frota/multas — todas as multas, cada uma com "quem estava com o
//        carro NA DATA da infração", resolvido na ordem (decisão do usuário):
//        1) USO DIÁRIO (vw_frota_uso_diario: quem marcou que pegou o carro no dia)
//        2) responsável FIXO vigente (frota_responsaveis)
//        3) o que a Rota Exata carimbou
// POST  /api/frota/multas — multa MANUAL (notificação que chegou por correio
//        etc., fora da Rota Exata). re_id sintético "manual:<uuid>" — a coluna
//        é UNIQUE NOT NULL e o sync upserta por ela, então o prefixo garante
//        que o espelho da Rota Exata nunca toca nem colide com as manuais.
// PATCH /api/frota/multas — status interno / desconto em folha / responsável.
//        Permissão de escrita (POST/PATCH): frota:multas:editar.
import { randomUUID } from 'crypto';
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

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const [multas, usos, resp, mots] = await Promise.all([
    supabase.from('frota_multas').select('*').order('dt_multa', { ascending: false }),
    supabase.from('vw_frota_uso_diario').select('veiculo_id, data, pessoa_nome'),
    supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome, inicio, fim'),
    supabase.from('frota_motoristas').select('id, nome'),
  ]);
  if (multas.error) return NextResponse.json({ error: multas.error.message }, { status: 500 });

  const nomeMotorista = new Map<string, string>();
  for (const p of mots.data || []) nomeMotorista.set(p.id, p.nome);

  const usoPorDia = new Map<string, string>();
  for (const u of usos.data || []) {
    if (u.pessoa_nome) usoPorDia.set(`${u.veiculo_id}|${u.data}`, u.pessoa_nome);
  }
  const fixoEm = (veiculoId: string | null, d: string): string | null => {
    if (!veiculoId) return null;
    const r = (resp.data || []).find(
      (x) => x.veiculo_id === veiculoId && x.inicio <= d && (x.fim === null || x.fim >= d),
    );
    return r?.motorista_nome ?? null;
  };

  const lista = (multas.data || []).map((m) => {
    const d = String(m.dt_multa || '').slice(0, 10);
    // Motorista definido NA MÃO na tela vence tudo; depois a cadeia automática.
    const manual = m.responsavel_id ? nomeMotorista.get(m.responsavel_id) || null : null;
    const uso = m.veiculo_id && d ? usoPorDia.get(`${m.veiculo_id}|${d}`) : null;
    const fixo = d ? fixoEm(m.veiculo_id, d) : null;
    const atribuido = manual || uso || fixo || m.motorista_nome || null;
    return {
      ...m,
      atribuido_a: atribuido,
      atribuido_fonte: manual
        ? 'manual'
        : uso ? 'uso_diario' : fixo ? 'responsavel_fixo' : m.motorista_nome ? 'rotaexata' : null,
      origem: String(m.re_id || '').startsWith('manual:') ? 'manual' : 'rotaexata',
    };
  });

  return NextResponse.json({ multas: lista });
}

const STATUS_VALIDOS = new Set(['nova', 'em_analise', 'em_defesa', 'paga', 'descontada', 'arquivada']);

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'multas:editar')) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar multas.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const veiculoId = String(body.veiculo_id || '');
  const dtMulta = String(body.dt_multa || '').trim();
  const descricao = String(body.descricao || '').trim();
  if (!veiculoId) return NextResponse.json({ error: 'Selecione o veículo.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dtMulta)) {
    return NextResponse.json({ error: 'Informe a data da infração.' }, { status: 400 });
  }
  if (!descricao) return NextResponse.json({ error: 'Descreva a infração.' }, { status: 400 });

  const valor = body.valor === '' || body.valor == null ? null : Number(body.valor);
  if (valor != null && (!Number.isFinite(valor) || valor < 0)) {
    return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });
  }
  const pontos = body.pontos === '' || body.pontos == null ? null : Math.trunc(Number(body.pontos));
  if (pontos != null && (!Number.isFinite(pontos) || pontos < 0)) {
    return NextResponse.json({ error: 'Pontos inválidos.' }, { status: 400 });
  }
  const dataOk = (v: unknown): string | null => {
    const t = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };
  const dtVencimento = String(body.dt_vencimento || '').trim();
  if (dtVencimento && !dataOk(dtVencimento)) {
    return NextResponse.json({ error: 'Vencimento inválido.' }, { status: 400 });
  }
  const hora = String(body.hora || '').trim();
  if (hora && !/^\d{2}:\d{2}$/.test(hora)) {
    return NextResponse.json({ error: 'Hora da infração inválida (HH:MM).' }, { status: 400 });
  }
  if (body.dt_defesa && !dataOk(body.dt_defesa)) {
    return NextResponse.json({ error: 'Prazo de defesa inválido.' }, { status: 400 });
  }
  if (body.indicacao_prazo && !dataOk(body.indicacao_prazo)) {
    return NextResponse.json({ error: 'Prazo de indicação inválido.' }, { status: 400 });
  }

  const { data: veic } = await supabase
    .from('frota_veiculos')
    .select('id, placa, placa_exibicao')
    .eq('id', veiculoId)
    .maybeSingle();
  if (!veic) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 400 });

  const { data: criada, error } = await supabase
    .from('frota_multas')
    .insert({
      re_id: `manual:${randomUUID()}`,
      veiculo_id: veic.id,
      placa: veic.placa,
      descricao,
      codigo: String(body.codigo || '').trim() || null,
      nivel_infracao: String(body.nivel_infracao || '').trim() || null,
      numero_auto: String(body.numero_auto || '').trim() || null,
      valor,
      pontos,
      // Sem hora informada fica meio-dia -03 (a atribuição de responsável
      // compara só a DATA — assim o dia não escorrega com fuso; a tela só
      // exibe a hora quando não for 12:00 em ponto).
      dt_multa: `${dtMulta}T${hora || '12:00'}:00-03:00`,
      dt_vencimento: dtVencimento || null,
      dt_defesa: dataOk(body.dt_defesa),
      indicacao_prazo: dataOk(body.indicacao_prazo),
      responsavel_id: String(body.responsavel_id || '').trim() || null,
      local_endereco: String(body.local_endereco || '').trim() || null,
      obs_interna: String(body.obs_interna || '').trim() || null,
      status_interno: 'nova',
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: 'criar',
    entidade: 'multa',
    entidadeId: criada.id,
    entidadeLabel: `Multa manual ${String(body.numero_auto || '').trim() || criada.id.slice(0, 8)} · ${veic.placa_exibicao || veic.placa} · R$ ${Number(valor || 0).toFixed(2)}`,
    detalhes: { origem: 'manual', dt_multa: dtMulta, descricao },
  });

  return NextResponse.json({ ok: true, id: criada.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'multas:editar')) {
    return NextResponse.json({ error: 'Sem permissão para editar multas.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'Informe o id da multa.' }, { status: 400 });

  const upd: Record<string, unknown> = {};
  if (body.status_interno !== undefined) {
    if (!STATUS_VALIDOS.has(String(body.status_interno))) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    upd.status_interno = body.status_interno;
  }
  if (body.responsavel_id !== undefined) upd.responsavel_id = body.responsavel_id || null;
  if (body.descontado_folha !== undefined) upd.descontado_folha = !!body.descontado_folha;
  if (body.desconto_competencia !== undefined) upd.desconto_competencia = body.desconto_competencia || null;
  if (body.obs_interna !== undefined) upd.obs_interna = String(body.obs_interna || '').trim() || null;
  // Indicação do condutor ao órgão (data em que foi indicado + prazo-limite)
  const soData = (v: unknown): string | null => {
    const t = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };
  if (body.condutor_indicado_em !== undefined) {
    if (body.condutor_indicado_em && !soData(body.condutor_indicado_em)) {
      return NextResponse.json({ error: 'Data de indicação inválida.' }, { status: 400 });
    }
    upd.condutor_indicado_em = soData(body.condutor_indicado_em);
  }
  if (body.indicacao_prazo !== undefined) {
    if (body.indicacao_prazo && !soData(body.indicacao_prazo)) {
      return NextResponse.json({ error: 'Prazo de indicação inválido.' }, { status: 400 });
    }
    upd.indicacao_prazo = soData(body.indicacao_prazo);
  }
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
  }

  // (para o audit log: como estava antes)
  const { data: antes } = await supabase
    .from('frota_multas')
    .select('placa, numero_auto, valor, status_interno, descontado_folha')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('frota_multas').update(upd).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logFrota(auth, {
    acao: upd.status_interno !== undefined ? 'mover_status' : 'editar',
    entidade: 'multa',
    entidadeId: id,
    entidadeLabel: antes
      ? `Multa ${antes.numero_auto || id.slice(0, 8)} · ${antes.placa} · R$ ${Number(antes.valor || 0).toFixed(2)}`
      : `Multa ${id.slice(0, 8)}`,
    detalhes: {
      ...(upd.status_interno !== undefined
        ? { status: { de: antes?.status_interno ?? null, para: upd.status_interno } }
        : {}),
      ...(upd.descontado_folha !== undefined
        ? { descontado_folha: { de: antes?.descontado_folha ?? null, para: upd.descontado_folha } }
        : {}),
      ...(upd.obs_interna !== undefined ? { obs_interna: upd.obs_interna } : {}),
      ...(upd.desconto_competencia !== undefined ? { desconto_competencia: upd.desconto_competencia } : {}),
      ...(upd.responsavel_id !== undefined ? { responsavel_id: upd.responsavel_id } : {}),
      ...(upd.condutor_indicado_em !== undefined ? { condutor_indicado_em: upd.condutor_indicado_em } : {}),
      ...(upd.indicacao_prazo !== undefined ? { indicacao_prazo: upd.indicacao_prazo } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
