// GET /api/frota/mapa/propriedades                 — municípios com CAR carregado (lista fixa, com o centro)
// GET /api/frota/mapa/propriedades?municipio=<ibge> — contornos dos imóveis rurais (CAR) do município
//
// Camada "Propriedades (CAR)" do mapa dos carros: mostra em que fazenda o carro
// está. Reaproveita as funções do Dashboard Agro (sql/agro-mapa.sql), mas
// devolve SÓ o contorno e dados neutros (código, área, cultura, cliente
// vinculado) — score, crédito e sugestões de vínculo são do Comercial e ficam
// no Dashboard Agro. Cache de 1 h em memória por município (~1 MB cada).
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { temAcessoMapa } from '@/lib/frota/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { MUNICIPIOS_CAR } from '@/lib/frota/car-municipios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; dados: unknown }>();

interface FeatureAgro {
  type: 'Feature';
  geometry: unknown;
  properties: Record<string, unknown>;
}

function limpar(fc: { features?: FeatureAgro[]; municipio?: string }) {
  return {
    type: 'FeatureCollection',
    municipio: fc.municipio || null,
    features: (fc.features || []).map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        cod_car: f.properties.cod_car ?? null,
        area_ha: f.properties.area_ha ?? null,
        cultura: f.properties.cultura_nome ?? null,
        // clientes vinculados (nome/código) — o que interessa ao pós-vendas
        clientes: f.properties.clientes ?? null,
      },
    })),
  };
}

export async function GET(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temAcessoMapa(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const municipio = new URL(req.url).searchParams.get('municipio');
  const chave = municipio || 'lista';
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.dados);

  try {
    let dados: unknown;
    if (!municipio) {
      // lista fixa: agro_mapa_municipios() estoura o statement timeout (calcula o
      // centro de ~34 mil polígonos a cada chamada) — ver lib/frota/car-municipios.ts
      dados = { municipios: MUNICIPIOS_CAR };
    } else {
      const ibge = Number(municipio);
      if (!Number.isInteger(ibge)) return NextResponse.json({ error: 'municipio inválido' }, { status: 400 });
      // tolerância um pouco maior que a do Dashboard Agro: o contorno é só referência
      const { data, error } = await supabaseAdmin.rpc('agro_mapa_municipio', { p_ibge: ibge, p_tol: 0.0002 });
      if (error) throw error;
      dados = limpar((data || {}) as { features?: FeatureAgro[]; municipio?: string });
    }
    cache.set(chave, { at: Date.now(), dados });
    return NextResponse.json(dados);
  } catch (e) {
    const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
    if (/agro_mapa_/.test(m) && /not find|does not exist|schema cache/i.test(m)) {
      return NextResponse.json({ error: 'Camada de propriedades indisponível (falta sql/agro-mapa.sql).', migracaoFaltando: true }, { status: 503 });
    }
    if (/statement timeout/i.test(m)) {
      return NextResponse.json({ error: 'O banco demorou para responder. Tente ligar a camada de novo em instantes.' }, { status: 503 });
    }
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
