// Cliente Supabase server-side do módulo Estoque + helper de filtro por conta.
//
// As tabelas de estoque (vendas_itens, cmc_historico, etc.) estão SEM RLS no
// projeto citrhumdkfivdzbmayde, então o anon key já lê/escreve. Mesmo assim,
// preferimos a service role key quando disponível (escritas como upsert de
// cmc_historico), com fallback para a anon key — mesmo padrão de
// src/app/api/admin/resetar-senha/route.ts.

import { createClient } from '@supabase/supabase-js';
import type { ContaFiltro } from './conta';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Substituto tipado de aplicarFiltroConta (server.js). Aplica
 * .eq('conta_omie', conta) quando uma conta específica é pedida; em modo
 * "Todas" (conta === undefined) retorna a query inalterada.
 */
export function filtroConta<T>(query: T, conta: ContaFiltro): T {
  if (!conta) return query;
  // Cast interno: evita threading do tipo profundo do PostgrestFilterBuilder
  // pela constraint genérica (causava TS2589 "type instantiation excessively deep").
  return (query as { eq(coluna: string, valor: string): T }).eq('conta_omie', conta);
}
