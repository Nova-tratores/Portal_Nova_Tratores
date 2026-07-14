// =============================================================================
// PROPRIEDADES DE CLIENTES — as fazendas/sítios geocodificados do cadastro de
// clientes do portal (tabela portal_nt_clientes_PRINCIPAL, a mesma que alimenta
// as visitas do comercial). Poucas têm lat/lng hoje (~49 de ~6mil), mas a lista
// cresce conforme o comercial marca — e o Frota pega de graça:
//   - camada de pins no /frota/mapa
//   - absolvição de parada ('cliente_portal') no fechar-dia
//   - rótulo "onde o carro está" na lista de Veículos
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { raioPropriedadeM, type GeocercaCtx } from './paradas';

export interface PropriedadeCliente {
  id: string;
  nome: string;
  cidade: string | null;
  latitude: number;
  longitude: number;
  raio_m: number; // derivado da área (ha) — ver raioPropriedadeM
}

export async function carregarPropriedades(supabase: SupabaseClient): Promise<PropriedadeCliente[]> {
  const { data, error } = await supabase
    .from('portal_nt_clientes_PRINCIPAL')
    .select('id, nome_fantasia, razao_social, cidade, latitude, longitude, area_hectares')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (error) throw new Error(`portal_nt_clientes_PRINCIPAL: ${error.message}`);
  return (data || [])
    .filter((c) => Number(c.latitude) && Number(c.longitude)) // 0,0 não é coordenada
    .map((c) => ({
      id: String(c.id),
      nome: String(c.nome_fantasia || c.razao_social || '').trim() || `Cliente ${c.id}`,
      cidade: (c.cidade as string) || null,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      raio_m: raioPropriedadeM(c.area_hectares as number | null),
    }));
}

/** Converte pro formato do classificador de paradas (origem='propriedade'). */
export function propriedadesComoGeocercas(props: PropriedadeCliente[]): GeocercaCtx[] {
  return props.map((p) => ({
    id: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    raio_m: p.raio_m,
    classe: 'cliente',
    nome: p.nome,
    cliente_id: p.id,
    origem: 'propriedade' as const,
  }));
}
