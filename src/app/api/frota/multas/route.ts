// GET   /api/frota/multas — todas as multas, cada uma com "quem estava com o
//        carro NA DATA da infração", resolvido na ordem (decisão do usuário):
//        1) USO DIÁRIO (vw_frota_uso_diario: quem marcou que pegou o carro no dia)
//        2) responsável FIXO vigente (frota_responsaveis)
//        3) o que a Rota Exata carimbou
// PATCH /api/frota/multas — status interno / desconto em folha / responsável.
//        Permissão: frota:multas:editar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota, temModuloFrota } from '@/lib/frota/server';

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

  const [multas, usos, resp] = await Promise.all([
    supabase.from('frota_multas').select('*').order('dt_multa', { ascending: false }),
    supabase.from('vw_frota_uso_diario').select('veiculo_id, data, pessoa_nome'),
    supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome, inicio, fim'),
  ]);
  if (multas.error) return NextResponse.json({ error: multas.error.message }, { status: 500 });

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
    const uso = m.veiculo_id && d ? usoPorDia.get(`${m.veiculo_id}|${d}`) : null;
    const fixo = d ? fixoEm(m.veiculo_id, d) : null;
    const atribuido = uso || fixo || m.motorista_nome || null;
    return {
      ...m,
      atribuido_a: atribuido,
      atribuido_fonte: uso ? 'uso_diario' : fixo ? 'responsavel_fixo' : m.motorista_nome ? 'rotaexata' : null,
    };
  });

  return NextResponse.json({ multas: lista });
}

const STATUS_VALIDOS = new Set(['nova', 'em_analise', 'em_defesa', 'paga', 'descontada', 'arquivada']);

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
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
  }

  const { error } = await supabase.from('frota_multas').update(upd).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
