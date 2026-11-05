// Leitura das geocercas ATIVAS da frota (frota_geocercas), inteira.
//
// A tabela tem ~2,6 mil locais (a maioria vem da Rota Exata) e o PostgREST corta
// cada resposta em 1000 linhas. Lida numa consulta só, ~60% dos locais sumiam: o
// classificador de paradas (fechar-dia, localização, mapa ao vivo) não os via e
// parada em local conhecido virava "atípica". Use SEMPRE esta função.
import type { SupabaseClient } from '@supabase/supabase-js';
import { paginar } from '@/lib/db/paginar';

export async function carregarGeocercasAtivas<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  colunas: string,
): Promise<{ data: T[]; error: { message: string } | null }> {
  return paginar<T>((de, ate) =>
    supabase
      .from('frota_geocercas')
      .select(colunas)
      .eq('ativo', true)
      .order('id')
      .range(de, ate) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  );
}
