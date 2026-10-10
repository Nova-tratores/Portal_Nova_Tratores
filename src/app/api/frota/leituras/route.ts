// POST  /api/frota/leituras — registra uma leitura de km (foto do painel).
//       Confere contra a última leitura conferida: se voltar ou saltar demais,
//       grava como SUSPEITA (não vira âncora até alguém conferir).
//       client_uuid torna o reenvio da fila sem sinal idempotente.
// PATCH /api/frota/leituras — { id, acao: 'aceitar' | 'descartar' } (conferência na aba Hoje)
//
// Quem registra: módulo Frota ou "Pendências da frota" (o técnico no celular).
// Ajuste do gestor (fonte 'ajuste_gestor') e conferência: frota:veiculos:editar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { logFrota, podeFrota, temModuloPendencias } from '@/lib/frota/server';
import { carregarKm } from '@/lib/frota/km-server';
import { validarLeitura } from '@/lib/frota/km';
import { resolverPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const semTabela = (m: string) => /frota_leituras|relation .* does not exist|schema cache/i.test(m);
const MSG_MIGRACAO = 'Falta aplicar sql/frota-leituras.sql no Supabase para registrar o km.';

// nome de quem leu/conferiu (financeiro_usu), com o e-mail como reserva
async function nomeDe(auth: { userId: string; email: string | null }): Promise<string> {
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
  return String(data?.nome || auth.email || auth.userId);
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloPendencias(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const placa = resolverPlaca(String(body.placa || ''));
  const km = Number(String(body.km ?? '').replace(/\D/g, ''));
  const fonte = body.fonte === 'ajuste_gestor' ? 'ajuste_gestor' : 'painel_foto';
  const clientUuid = UUID_RE.test(String(body.client_uuid || '')) ? String(body.client_uuid) : null;
  if (!placa) return NextResponse.json({ error: 'Informe a placa.' }, { status: 400 });
  if (!km) return NextResponse.json({ error: 'Informe o km do painel.' }, { status: 400 });
  if (fonte === 'painel_foto' && !body.foto_url) return NextResponse.json({ error: 'A foto do painel é obrigatória.' }, { status: 400 });
  if (fonte === 'ajuste_gestor' && !podeFrota(auth, 'veiculos:editar')) {
    return NextResponse.json({ error: 'Só quem edita a Ficha pode ajustar o km.' }, { status: 403 });
  }

  // reenvio da fila: já gravada → devolve a mesma
  if (clientUuid) {
    const { data: ja, error } = await supabase.from('frota_leituras').select('id, situacao, motivo').eq('client_uuid', clientUuid).maybeSingle();
    if (error && semTabela(error.message)) return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
    if (ja) return NextResponse.json({ ok: true, id: ja.id, situacao: ja.situacao, motivos: ja.motivo ? [ja.motivo] : [], repetida: true });
  }

  try {
    const lidaEm = /^\d{4}-\d{2}-\d{2}/.test(String(body.lida_em || '')) ? new Date(body.lida_em).toISOString() : new Date().toISOString();
    const { porPlaca } = await carregarKm(supabase, { placas: [placa] });
    const k = porPlaca.get(placa);
    if (!k) return NextResponse.json({ error: 'Veículo não encontrado na frota.' }, { status: 404 });

    const v = fonte === 'ajuste_gestor'
      ? { situacao: 'aceita' as const, motivos: [], sugestao: null }
      : validarLeitura({ km, em: lidaEm }, { anterior: k.ancora, esperado: k.resultado.km, tipo: k.tipo });

    const { data, error } = await supabase.from('frota_leituras').insert({
      client_uuid: clientUuid,
      veiculo_id: k.veiculo_id,
      placa,
      lida_em: lidaEm,
      km,
      foto_url: body.foto_url ? String(body.foto_url) : null,
      fonte,
      lido_por: await nomeDe(auth),
      lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
      lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
      situacao: v.situacao,
      motivo: v.motivos.join(' ') || null,
    }).select('id').single();
    if (error) {
      if (semTabela(error.message)) return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
      if (error.code === '23505') return NextResponse.json({ ok: true, repetida: true, situacao: v.situacao, motivos: v.motivos });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await logFrota(auth, {
      acao: 'criar', entidade: 'leitura_km', entidadeId: data.id,
      entidadeLabel: `Km ${placa}: ${km.toLocaleString('pt-BR')}${v.situacao === 'suspeita' ? ' (suspeita)' : ''}`,
      detalhes: { placa, km, fonte, situacao: v.situacao, motivos: v.motivos },
    });
    return NextResponse.json({ ok: true, id: data.id, situacao: v.situacao, motivos: v.motivos, sugestao: v.sugestao });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) return NextResponse.json({ error: 'Só quem edita a Ficha confere leituras.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const acao = body.acao === 'aceitar' ? 'aceita' : body.acao === 'descartar' ? 'descartada' : null;
  if (!id || !acao) return NextResponse.json({ error: 'Informe id e acao (aceitar/descartar).' }, { status: 400 });

  const { data, error } = await supabase.from('frota_leituras')
    .update({ situacao: acao, conferido_por: await nomeDe(auth), conferido_em: new Date().toISOString() })
    .eq('id', id).select('placa, km').maybeSingle();
  if (error) {
    if (semTabela(error.message)) return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logFrota(auth, {
    acao: 'editar', entidade: 'leitura_km', entidadeId: id,
    entidadeLabel: `Km ${data?.placa || ''}: ${acao === 'aceita' ? 'conferida e aceita' : 'descartada'}`,
    detalhes: { acao, km: data?.km },
  });
  return NextResponse.json({ ok: true });
}
