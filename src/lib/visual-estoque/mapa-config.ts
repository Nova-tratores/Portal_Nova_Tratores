import { supabaseVE } from "./supabase";

// Config de zonas do mapa (pátio e frota), persistida na tabela `mapa_config`
// (id 'default' = pátio, id 'frota' = frota). Porta /api/mapa-config e
// /api/frota-config do app legado, incluindo os defaults forçados de zona.

export type Zona = { x: number; y: number; w: number; h: number };
export type ZonasConfig = Record<string, Zona>;

// Defaults forçados sobre o que estiver salvo (server.js ~690-694 e ~714-717).
const DEFAULTS: Record<string, ZonasConfig> = {
  default: {
    patio: { x: 0.3, y: 0.6, w: 44.7, h: 98.8 },
    oficina: { x: 45, y: 0.6, w: 54.7, h: 30 },
    showroom: { x: 45, y: 30.6, w: 43, h: 68.8 },
    oficina2: { x: 88, y: 30.6, w: 11.7, h: 68.8 },
  },
  frota: {
    garagem: { x: 0.3, y: 0.6, w: 59.5, h: 98.8 },
    campo: { x: 60.2, y: 0.6, w: 39.5, h: 59.4 },
    manutencao: { x: 60.2, y: 61.2, w: 39.5, h: 38.2 },
  },
};

export async function carregarMapaConfig(id: "default" | "frota"): Promise<ZonasConfig> {
  const { data } = await supabaseVE.from("mapa_config").select("zonas").eq("id", id).single();
  const zonas: ZonasConfig = (data?.zonas as ZonasConfig) || {};
  const forcado = DEFAULTS[id] || {};
  for (const [nome, def] of Object.entries(forcado)) {
    zonas[nome] = { ...(zonas[nome] || def), ...def };
  }
  return zonas;
}

export async function salvarMapaConfig(id: "default" | "frota", zonas: ZonasConfig): Promise<void> {
  const { error } = await supabaseVE.from("mapa_config").upsert({ id, zonas });
  if (error) throw error;
}
