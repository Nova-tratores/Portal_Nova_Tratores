// GET /api/frota/mapa/tempo-loja?lat=&lng= — quanto tempo a frota leva da loja
// até o ponto e de volta, pelo histórico real (frota_paradas desde jan/2026).
// Regras em lib/frota/tempo-loja.ts. As viagens são montadas uma vez por hora
// (cache em memória) e cada clique só filtra perto do ponto.
// Km: PROJETADO = rota pela estrada (OpenRouteService) e REALIZADO = mediana do
// que os carros rodaram nessas mesmas viagens, pelos pontos do rastreador
// (rotas_vendedor guarda os pontos dos últimos 90 dias).
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { temAcessoMapa } from '@/lib/frota/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { LOJA_LAT, LOJA_LNG } from '@/lib/pos/rastreamento';
import { calcularRota } from '@/lib/pos/ors';
import { diaBR } from '@/lib/frota/mapa-vivo';
import {
  distKm, estimar, extrairViagens, kmNoTrecho, kmRealizado, modeloDistancia, selecionarViagens,
  type ModeloDistancia, type ParadaHist, type PontoRota, type Viagem,
} from '@/lib/frota/tempo-loja';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOJA = { lat: LOJA_LAT, lng: LOJA_LNG };
const TTL_MS = 60 * 60_000;
let memo: { at: number; viagens: Viagem[]; modelo: ModeloDistancia | null } | null = null;
let emAndamento: Promise<{ viagens: Viagem[]; modelo: ModeloDistancia | null }> | null = null;

async function carregar() {
  if (memo && Date.now() - memo.at < TTL_MS) return memo;
  if (!emAndamento) {
    emAndamento = (async () => {
      const r = await paginar((a, b) => supabaseAdmin
        .from('frota_paradas')
        .select('placa, inicio, fim, latitude, longitude, classe')
        .eq('ignorada', false)
        .order('id')
        .range(a, b));
      if (r.error) throw new Error(r.error.message);
      const viagens = extrairViagens((r.data || []) as unknown as ParadaHist[], LOJA);
      const dados = { viagens, modelo: modeloDistancia(viagens) };
      memo = { at: Date.now(), ...dados };
      return dados;
    })().finally(() => { emAndamento = null; });
  }
  return emAndamento;
}

// Rota pela estrada: 1 chamada ao ORS por ponto (arredondado ~100 m), guardada 24 h.
const rotas = new Map<string, { at: number; km: number | null }>();
async function kmProjetado(lat: number, lng: number): Promise<number | null> {
  const k = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = rotas.get(k);
  if (c && Date.now() - c.at < 24 * TTL_MS) return c.km;
  const r = await calcularRota(LOJA.lat, LOJA.lng, lat, lng);
  const km = r ? r.distancia_km : null;
  if (rotas.size > 2000) rotas.clear();
  rotas.set(k, { at: Date.now(), km });
  return km;
}

/** Até 12 viagens mais recentes de cada sentido; os pontos vêm do dia da viagem. */
const MAX_VIAGENS_KM = 12;
async function kmDasViagens(vs: Viagem[]): Promise<{ km: number | null; viagens: number }> {
  const recentes = vs.filter((v) => v.placa && v.saida && v.chegada)
    .sort((a, b) => b.saida!.localeCompare(a.saida!)).slice(0, MAX_VIAGENS_KM);
  if (!recentes.length) return { km: null, viagens: 0 };
  const pares = new Set<string>();
  for (const v of recentes) { pares.add(`${v.placa}|${diaBR(v.saida!)}`); pares.add(`${v.placa}|${diaBR(v.chegada!)}`); }
  const filtro = [...pares].map((p) => { const [placa, data] = p.split('|'); return `and(placa.eq.${placa},data.eq.${data})`; }).join(',');
  const { data, error } = await supabaseAdmin.from('rotas_vendedor').select('placa, data, pontos').or(filtro);
  if (error) return { km: null, viagens: 0 };
  const porPlaca = new Map<string, PontoRota[]>();
  for (const r of (data || []) as { placa: string; pontos: PontoRota[] | null }[]) {
    porPlaca.set(r.placa, [...(porPlaca.get(r.placa) || []), ...(r.pontos || [])]);
  }
  return kmRealizado(recentes.map((v) => kmNoTrecho(porPlaca.get(v.placa!) || [], v.saida!, v.chegada!)));
}

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temAcessoMapa(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat'));
  const lng = Number(u.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'lat/lng inválidos' }, { status: 400 });
  try {
    const { viagens, modelo } = await carregar();
    const ponto = { lat, lng };
    const kmReto = distKm(LOJA.lat, LOJA.lng, lat, lng);
    if (kmReto < 1) return NextResponse.json({ naLoja: true, kmReto });
    const selIda = selecionarViagens(ponto, viagens, 'ida', modelo);
    const selVolta = selecionarViagens(ponto, viagens, 'volta', modelo);
    const [projetado, realIda, realVolta] = await Promise.all([
      kmProjetado(lat, lng).catch(() => null),
      selIda ? kmDasViagens(selIda.limpas).catch(() => null) : null,
      selVolta ? kmDasViagens(selVolta.limpas).catch(() => null) : null,
    ]);
    return NextResponse.json({
      kmReto: Math.round(kmReto * 10) / 10,
      kmProjetado: projetado,
      ida: { ...estimar(ponto, LOJA, viagens, 'ida', modelo), kmRealizado: realIda?.km ?? null, viagensKm: realIda?.viagens ?? 0 },
      volta: { ...estimar(ponto, LOJA, viagens, 'volta', modelo), kmRealizado: realVolta?.km ?? null, viagensKm: realVolta?.viagens ?? 0 },
      baseViagens: viagens.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
