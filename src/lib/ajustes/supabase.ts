// Cliente Supabase server-side do módulo Ajustes + helper de filtro por conta.
//
// Mesmo projeto Supabase do Portal/estoque (citrhumdkfivdzbmayde). As tabelas
// de ajustes (cmc_correcoes, contas_correcoes, etc.) estão SEM RLS, então o anon
// key já lê/escreve. Preferimos a service role quando disponível (escritas de
// auditoria), com fallback para a anon — mesmo padrão de lib/estoque/supabase.ts.

import { createClient } from '@supabase/supabase-js';
import type { ContaFiltro } from './conta';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Aplica .eq('conta_omie', conta) quando uma conta específica é pedida; em modo
 * "Todas" (conta === undefined) retorna a query inalterada.
 */
export function filtroConta<T>(query: T, conta: ContaFiltro): T {
  if (!conta) return query;
  // Cast interno: evita TS2589 ("type instantiation excessively deep") ao
  // threadar o tipo profundo do PostgrestFilterBuilder pela constraint genérica.
  return (query as { eq(coluna: string, valor: string): T }).eq('conta_omie', conta);
}
