// GET /api/frota/localizacao — ONDE cada veículo rastreado está agora, em
// linguagem de gente: "Piraju — Cliente Faz 3 S" · "Piraju — Loja" ·
// "Piraju — Sem cadastro de local".
//
// Pipeline por veículo:
//   1. última posição: Rota Exata ao vivo (janela de 24h) e, se o rastreador
//      está mudo, o último ponto salvo em rotas_vendedor (carro parado há dias
//      continua com rótulo — "está lá desde a última vez que andou")
//   2. lugar: o MESMO classificador das paradas (geocercas da Rota Exata +
//      propriedades de clientes do portal) — em movimento vira "Em deslocamento"
//   3. cidade: da propriedade quando casou com uma; senão geocodificação
//      reversa com cache persistente (geocode_cache, célula de ~1km — cada
//      cidade é resolvida UMA vez na vida)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { fetchTudo } from '@/lib/pos/rastreamento';
import { classificarParada, type GeocercaCtx } from '@/lib/frota/paradas';
import { carregarPropriedades, propriedadesComoGeocercas } from '@/lib/frota/propriedades';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

interface Posicao {
  lat: number;
  lng: number;
  ignicao: boolean;
  velocidade: number;
  dt: string | null;
  fonte: 'ao_vivo' | 'cache';
}

async function ultimaPosicaoLive(adesaoId: number): Promise<Posicao | null> {
  const agora = new Date();
  const w = JSON.stringify({
    adesao_id: adesaoId,
    dt_posicao: { $gte: new Date(agora.getTime() - 24 * 3600_000).toISOString(), $lte: agora.toISOString() },
  });
  const posicoes = (await fetchTudo('/posicoes', { where: w }, 1000)).sort(
    (a: any, b: any) => new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime(),
  );
  const last = posicoes[posicoes.length - 1];
  if (!last?.latitude || !last?.longitude) return null;
  return {
    lat: last.latitude,
    lng: last.longitude,
    ignicao: last.ignicao === 1,
    velocidade: Number(last.velocidade) || 0,
    dt: last.dt_posicao || null,
    fonte: 'ao_vivo',
  };
}

// Fallback sem gastar API: o último ponto do último dia salvo em rotas_vendedor.
async function ultimaPosicaoCache(placa: string): Promise<Posicao | null> {
  const { data } = await supabase
    .from('rotas_vendedor')
    .select('data, pontos')
    .eq('placa', placa)
    .order('data', { ascending: false })
    .limit(7);
  for (const r of data || []) {
    const pontos = Array.isArray(r.pontos) ? r.pontos : [];
    const last = pontos[pontos.length - 1];
    if (last?.lat && last?.lng) {
      return { lat: last.lat, lng: last.lng, ignicao: false, velocidade: 0, dt: last.dt || null, fonte: 'cache' };
    }
  }
  return null;
}

// ── Cidade por geocodificação reversa, com cache eterno ─────────────────────
// Célula de 2 casas decimais (~1,1km): o mesmo pátio/fazenda/posto resolve a
// cidade UMA vez e nunca mais chama serviço externo.
const memCidade: Record<string, string> = {};

async function cidadePhoton(lat: number, lng: number): Promise<string> {
  const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default`, {
    headers: { 'User-Agent': 'PortalNovaTratores/1.0' },
    signal: AbortSignal.timeout(6_000),
  });
  if (!r.ok) return '';
  const feat = (await r.json()).features?.[0]?.properties;
  return feat?.city || feat?.town || feat?.village || feat?.county || '';
}

async function cidadeNominatim(lat: number, lng: number): Promise<string> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
    { headers: { 'User-Agent': 'PortalNovaTratores/1.0', 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(6_000) },
  );
  if (!r.ok) return '';
  const addr = (await r.json()).address || {};
  return addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
}

async function cidadeDe(lat: number, lng: number): Promise<string | null> {
  const key = `cidade:${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (memCidade[key] !== undefined) return memCidade[key] || null;
  try {
    const { data } = await supabase.from('geocode_cache').select('endereco').eq('coordenada', key).maybeSingle();
    if (data?.endereco) { memCidade[key] = data.endereco; return data.endereco; }
  } catch { /* tabela pode não existir */ }

  let cidade = '';
  try { cidade = await cidadePhoton(lat, lng); } catch { /* */ }
  if (!cidade) { try { cidade = await cidadeNominatim(lat, lng); } catch { /* */ } }
  // gentileza com os serviços públicos: 1 chamada externa por segundo
  await new Promise((r) => setTimeout(r, 1_100));

  memCidade[key] = cidade;
  if (cidade) {
    try { await supabase.from('geocode_cache').upsert({ coordenada: key, endereco: cidade, lat, lng }); } catch { /* */ }
  }
  return cidade || null;
}

function rotuloDe(classe: string, nome: string | null): string {
  switch (classe) {
    case 'loja': return 'Loja';
    case 'cliente':
    case 'cliente_portal': return nome ? `Cliente ${nome}` : 'Cliente';
    case 'manutencao': return nome ? `Manutenção · ${nome}` : 'Manutenção';
    case 'estacionamento': return 'Estacionamento';
    case 'descarga': return nome ? `Descarga · ${nome}` : 'Descarga';
    case 'outro_destino': return nome || 'Destino cadastrado';
    default: return 'Sem cadastro de local';
  }
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const [veic, geo, props] = await Promise.all([
      supabase
        .from('frota_veiculos')
        .select('id, placa, adesao_id')
        .not('adesao_id', 'is', null)
        .eq('tipo_registro', 'veiculo')
        .eq('ativo', true),
      supabase
        .from('frota_geocercas')
        .select('id, latitude, longitude, raio_m, classe, nome, cliente_id')
        .eq('ativo', true),
      carregarPropriedades(supabase).catch(() => []),
    ]);
    const veiculos = veic.data || [];
    const geocercas: GeocercaCtx[] = [
      ...((geo.data || []) as GeocercaCtx[]),
      ...propriedadesComoGeocercas(props),
    ];
    const cidadePorPropriedade = new Map(props.map((p) => [p.id, p.cidade]));

    // Posições em lotes (a Rota Exata é externa — não derrubar com 16 de uma vez)
    const posicoes = new Map<string, Posicao>();
    const BATCH = 8;
    for (let i = 0; i < veiculos.length; i += BATCH) {
      await Promise.all(
        veiculos.slice(i, i + BATCH).map(async (v) => {
          let pos: Posicao | null = null;
          try { pos = await ultimaPosicaoLive(Number(v.adesao_id)); } catch { /* */ }
          if (!pos) { try { pos = await ultimaPosicaoCache(v.placa); } catch { /* */ } }
          if (pos) posicoes.set(v.placa, pos);
        }),
      );
    }

    // Classificação + cidade — sequencial de propósito (o geocode externo é
    // serializado; quase tudo sai do cache depois da primeira carga)
    const ctxVazio = { visitas: [], abastecimentos: [] };
    const localizacoes: Record<string, unknown> = {};
    for (const v of veiculos) {
      const pos = posicoes.get(v.placa);
      if (!pos) continue;

      const c = classificarParada(
        { lat: pos.lat, lng: pos.lng, inicio: pos.dt || new Date().toISOString(), fim: null, duracao_min: 0 },
        { geocercas, ...ctxVazio },
      );

      const emMovimento = pos.fonte === 'ao_vivo' && pos.ignicao && pos.velocidade >= 15;
      const rotulo = emMovimento ? 'Em deslocamento' : rotuloDe(c.classe, c.destino_nome);

      // cidade: da propriedade casada > geocode reverso (cacheado)
      let cidade: string | null = null;
      if (c.classe === 'cliente_portal' && c.cliente_id) {
        cidade = cidadePorPropriedade.get(c.cliente_id) || null;
      }
      if (!cidade) cidade = await cidadeDe(pos.lat, pos.lng);

      localizacoes[v.placa] = {
        rotulo,
        cidade,
        classe: emMovimento ? 'em_deslocamento' : c.classe,
        local_nome: c.destino_nome,
        lat: pos.lat,
        lng: pos.lng,
        ignicao: pos.ignicao,
        dt: pos.dt,
        fonte: pos.fonte,
      };
    }

    return NextResponse.json({ localizacoes, atualizado_em: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
