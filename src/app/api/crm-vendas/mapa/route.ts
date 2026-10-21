// Mapa do supervisor no app de vendas (CRM Vendas → Mapa). O app não fala com
// o rastreador: o portal entrega os carros dos vendedores e o trajeto do dia.
//
// Login: token do Supabase Auth (o mesmo do portal). Pode quem é supervisor
// ativo do app (`supervisores.auth_uid`) ou tem CRM Vendas / Supervisor de
// Vendas no portal. Só carros que estão com algum vendedor.
//
//   GET                         -> { carros: CarroDoVendedor[], atualizado_em }
//   GET ?placa=XXX&data=AAAA-MM-DD -> trajeto + paradas + timeline do dia
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { autenticar } from '@/lib/auth/server';
import { corsVendas } from '@/lib/vendas-app/cors';
import { carregarVivos, geocercasCtx } from '@/lib/frota/mapa-vivo-server';
import { diaBR, rotuloLocal } from '@/lib/frota/mapa-vivo';
import { classificarParada, type GeocercaCtx } from '@/lib/frota/paradas';
import { computarESalvarRota } from '@/lib/pos/rastreamento';
import { resolverPlaca } from '@/lib/frota/placa';
import { paradasNoUso } from '@/lib/frota/ignicao';
import { carrosDosVendedores, desenhoDaRota, montarTimeline, type ParadaRota } from '@/lib/vendas-app/mapa-vendedores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req, 'GET, OPTIONS') });
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req, 'GET, OPTIONS') });
}

async function podeVer(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: sup } = await supabaseAdmin.from('supervisores').select('ativo').eq('auth_uid', data.user.id).maybeSingle();
  if (sup && sup.ativo !== false) return true;
  const auth = await autenticar(req);
  if (!auth) return false;
  return auth.isAdmin || auth.modulos.some((m) => m === 'crm-vendas' || m === 'supervisor-vendas' || m.startsWith('supervisor-vendas:'));
}

async function carrosAgora() {
  const [{ veiculos, atualizado_em }, { data: vends }] = await Promise.all([
    carregarVivos(supabaseAdmin),
    supabaseAdmin.from('vendedores').select('id, nome').eq('ativo', true),
  ]);
  const vendedores = (vends || []).map((v) => ({ id: Number(v.id), nome: String(v.nome || '') }));
  return { carros: carrosDosVendedores(vendedores, veiculos), atualizado_em };
}

export async function GET(req: NextRequest) {
  if (!(await podeVer(req))) return json(req, { error: 'Sem permissão para ver o mapa dos vendedores.' }, 403);
  try {
    const placaParam = req.nextUrl.searchParams.get('placa');
    if (!placaParam) return json(req, await carrosAgora());

    const placa = resolverPlaca(placaParam);
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get('data') || '') ? req.nextUrl.searchParams.get('data')! : diaBR();
    const { carros } = await carrosAgora();
    if (!carros.some((c) => c.placa === placa)) return json(req, { error: 'Este carro não está com nenhum vendedor.' }, 403);

    const [rota, geocercas, uso] = await Promise.all([
      computarESalvarRota(supabaseAdmin, placa, data),
      geocercasCtx(supabaseAdmin).catch(() => [] as GeocercaCtx[]),
      supabaseAdmin.from('vw_frota_uso_diario').select('pessoa_nome, created_at').eq('placa', placa).eq('data', data)
        .order('created_at', { ascending: false }).limit(1),
    ]);
    const localDe = (lat: number, lng: number, inicio = new Date().toISOString()) => {
      const c = classificarParada({ lat, lng, inicio, fim: null, duracao_min: 0 }, { geocercas, visitas: [], abastecimentos: [] });
      const r = rotuloLocal(c.classe, c.destino_nome);
      return r === 'Sem cadastro de local' ? null : r;
    };
    // só o dia de uso (1ª vez ligado → último desligamento): a madrugada do carro
    // estacionado não é "saiu 00:08" nem "parou 7h"
    const janela = { inicio: rota.hora_inicio || null, fim: rota.hora_fim || null };
    // sem janela = o carro não foi ligado no dia: nada de trajeto
    const pontosDia = janela.inicio ? (rota.pontos || []).filter((p) => p.dt >= janela.inicio! && (!janela.fim || p.dt <= janela.fim)) : [];
    const { pontos, segmentos, buracos } = desenhoDaRota(pontosDia);
    const paradas: ParadaRota[] = ((rota.pontos || []).length ? paradasNoUso(rota.paradas || [], janela) : (rota.paradas || []))
      .filter((p) => p.lat && p.lng)
      .map((p) => ({ lat: p.lat, lng: p.lng, inicio: p.inicio, fim: p.fim, duracao_min: p.duracao_min, local: localDe(p.lat, p.lng, p.inicio) }));
    return json(req, {
      placa, data,
      motorista_dia: uso.data?.[0]?.pessoa_nome || null,
      resumo: {
        km: rota.km_total || 0,
        paradas: paradas.length,
        visitas: (rota.visitas || []).length,
        dirigindo_min: rota.tempo_dirigindo_min || 0,
        inicio: rota.hora_inicio || null,
        fim: rota.hora_fim || null,
      },
      segmentos, buracos, paradas,
      inicio: pontos[0] ? [pontos[0].lat, pontos[0].lng] : null,
      fim: pontos.length ? [pontos[pontos.length - 1].lat, pontos[pontos.length - 1].lng] : null,
      timeline: montarTimeline(pontos, paradas, rota.hora_inicio || null, rota.hora_fim || null, (lat, lng) => localDe(lat, lng)),
    });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
