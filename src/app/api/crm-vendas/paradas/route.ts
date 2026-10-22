// Paradas longas do carro do VENDEDOR para ele explicar (app de vendas).
// Parada de 30 min ou mais, sem visita registrada perto, vira "a explicar"; o
// vendedor toca o motivo. Nada vira visita sozinho (decisão de 22/10/2026).
//
// Login: token do Supabase Auth do app; só o vendedor ativo, só no carro dele.
//   GET  ?data=AAAA-MM-DD  -> { data, placa, paradas: [...com situacao/motivo] }
//   POST { placa, inicio, fim, duracao_min, lat, lng, motivo, observacao }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { corsVendas } from '@/lib/vendas-app/cors';
import { carregarVivos, geocercasCtx } from '@/lib/frota/mapa-vivo-server';
import { diaBR, rotuloLocal } from '@/lib/frota/mapa-vivo';
import { classificarParada, type GeocercaCtx } from '@/lib/frota/paradas';
import { paradasNoUso } from '@/lib/frota/ignicao';
import { computarESalvarRota } from '@/lib/pos/rastreamento';
import { resolverPlaca } from '@/lib/frota/placa';
import { carrosDosVendedores } from '@/lib/vendas-app/mapa-vendedores';
import { motivoValido, PARADA_LONGA_MIN } from '@/lib/vendas-app/paradas';
import { situacaoDasParadas } from '@/lib/vendas-app/paradas-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req) });
}
export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req) });
}

async function validarTokenVendedor(req: NextRequest): Promise<{ id: number; nome: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: v } = await supabaseAdmin.from('vendedores').select('id, nome, ativo').eq('auth_uid', data.user.id).maybeSingle();
  return v && v.ativo !== false ? { id: Number(v.id), nome: String(v.nome || '') } : null;
}

/** Placa do carro que está com o vendedor (check-in de hoje > responsável da Frota). */
async function placaDoVendedor(vend: { id: number; nome: string }): Promise<string | null> {
  const { veiculos } = await carregarVivos(supabaseAdmin);
  return carrosDosVendedores([vend], veiculos)[0]?.placa || null;
}

export async function GET(req: NextRequest) {
  const vend = await validarTokenVendedor(req);
  if (!vend) return json(req, { error: 'Entre no app com seu usuário de vendedor.' }, 401);
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get('data') || '') ? req.nextUrl.searchParams.get('data')! : diaBR();
    const placa = await placaDoVendedor(vend);
    if (!placa) return json(req, { data, placa: null, paradas: [], aviso: 'Nenhum carro com rastreador em seu nome na Frota.' });

    const [rota, geocercas] = await Promise.all([
      computarESalvarRota(supabaseAdmin, placa, data),
      geocercasCtx(supabaseAdmin).catch(() => [] as GeocercaCtx[]),
    ]);
    const janela = { inicio: rota.hora_inicio || null, fim: rota.hora_fim || null };
    const longas = paradasNoUso(rota.paradas || [], janela)
      .filter((p) => p.lat && p.lng && p.duracao_min >= PARADA_LONGA_MIN)
      .map((p) => {
        const c = classificarParada({ lat: p.lat, lng: p.lng, inicio: p.inicio, fim: null, duracao_min: 0 }, { geocercas, visitas: [], abastecimentos: [] });
        const local = rotuloLocal(c.classe, c.destino_nome);
        return { lat: p.lat, lng: p.lng, inicio: p.inicio, fim: p.fim, duracao_min: p.duracao_min, local: local === 'Sem cadastro de local' ? null : local };
      });
    const paradas = await situacaoDasParadas(placa, data, vend.id, longas);
    return json(req, { data, placa, paradas });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function POST(req: NextRequest) {
  const vend = await validarTokenVendedor(req);
  if (!vend) return json(req, { error: 'Entre no app com seu usuário de vendedor.' }, 401);
  const b = await req.json().catch(() => ({}));
  if (!motivoValido(b?.motivo)) return json(req, { error: 'Motivo inválido.' }, 400);
  if (!b?.inicio || Number.isNaN(new Date(b.inicio).getTime())) return json(req, { error: 'Parada inválida.' }, 400);
  const placa = await placaDoVendedor(vend);
  if (!placa || resolverPlaca(String(b.placa || '')) !== placa) return json(req, { error: 'Este carro não está em seu nome na Frota.' }, 403);

  const { error } = await supabaseAdmin.from('vendas_paradas_explicadas').upsert({
    placa,
    inicio: b.inicio,
    fim: b.fim || null,
    duracao_min: Number(b.duracao_min) || null,
    lat: Number(b.lat) || null,
    lng: Number(b.lng) || null,
    vendedor_id: vend.id,
    motivo: b.motivo,
    observacao: String(b.observacao || '').trim().slice(0, 300) || null,
    explicado_em: new Date().toISOString(),
  }, { onConflict: 'placa,inicio' });
  if (error) {
    const falta = /vendas_paradas_explicadas/.test(error.message);
    return json(req, { error: falta ? 'Registro de paradas ainda não está ativo (falta aplicar a migration).' : error.message }, falta ? 503 : 500);
  }
  return json(req, { ok: true });
}
