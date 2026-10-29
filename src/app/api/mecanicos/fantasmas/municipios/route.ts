// Limites das cidades para o mapa do furo de km (José, 29/10/2026: "consegue destacar os limites da cidade?").
// Malha de municípios do IBGE (SP e PR — a região encosta no Paraná), baixada uma vez por processo e recortada pelo
// retângulo do caminho do dia. GET ?bbox=oeste,sul,leste,norte → GeoJSON com { nome } em cada cidade.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Feature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: { codarea: string; nome?: string; bbox?: number[] } };
const ESTADOS = ['35', '41'];
let malha: Promise<Feature[]> | null = null;

function caixa(coords: unknown): number[] {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const andar = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number') { const [x, y] = c as number[]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) }
    else if (Array.isArray(c)) c.forEach(andar);
  };
  andar(coords);
  return b;
}

async function carregar(): Promise<Feature[]> {
  const out: Feature[] = [];
  for (const uf of ESTADOS) {
    const [g, n] = await Promise.all([
      fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${uf}?formato=application/vnd.geo%2Bjson&qualidade=intermediaria&intrarregiao=municipio`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()),
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()),
    ]);
    const nomes = new Map<string, string>(((n || []) as { id: number; nome: string }[]).map((m) => [String(m.id), m.nome]));
    for (const f of ((g?.features || []) as Feature[])) {
      f.properties = { codarea: f.properties.codarea, nome: nomes.get(String(f.properties.codarea)) || '', bbox: caixa(f.geometry.coordinates) };
      out.push(f);
    }
  }
  if (!out.length) throw new Error('IBGE sem municípios');
  return out;
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }]);
  if (g.resposta) return g.resposta;
  const bb = String(req.nextUrl.searchParams.get('bbox') || '').split(',').map(Number);
  if (bb.length !== 4 || bb.some((v) => !Number.isFinite(v)) || bb[2] - bb[0] > 4 || bb[3] - bb[1] > 4) return NextResponse.json({ error: 'bbox inválido' }, { status: 400 });
  try {
    malha ??= carregar().catch((e) => { malha = null; throw e; });
    const todas = await malha;
    const [o, s, l, n] = bb;
    const features = todas.filter((f) => { const b = f.properties.bbox!; return b[0] <= l && b[2] >= o && b[1] <= n && b[3] >= s })
      .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { codarea: f.properties.codarea, nome: f.properties.nome } }));
    return NextResponse.json({ type: 'FeatureCollection', features }, { headers: { 'Cache-Control': 'private, max-age=86400' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
