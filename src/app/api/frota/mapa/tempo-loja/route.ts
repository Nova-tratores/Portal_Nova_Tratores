// GET /api/frota/mapa/tempo-loja?lat=&lng= — quanto tempo a frota leva da loja
// até o ponto e de volta, pelo histórico real (frota_paradas desde jan/2026).
// Regras em lib/frota/tempo-loja.ts. As viagens são montadas uma vez por hora
// (cache em memória) e cada clique só filtra perto do ponto.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { temAcessoMapa } from '@/lib/frota/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { LOJA_LAT, LOJA_LNG } from '@/lib/pos/rastreamento';
import { distKm, estimar, extrairViagens, modeloDistancia, type ModeloDistancia, type ParadaHist, type Viagem } from '@/lib/frota/tempo-loja';

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
    return NextResponse.json({
      kmReto: Math.round(kmReto * 10) / 10,
      ida: estimar(ponto, LOJA, viagens, 'ida', modelo),
      volta: estimar(ponto, LOJA, viagens, 'volta', modelo),
      baseViagens: viagens.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
