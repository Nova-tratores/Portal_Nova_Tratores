// Filtro de clientes ignorados (CNPJs a não contabilizar — vendas entre lojas).
// Portado de server.js (getIgnorarClientes/getIgnorarFiltro/invalidarIgnorarCache).
//
// Coluna em Clientes_Omie é `cpf/cnpj` (com BARRA no nome) → usar .filter(),
// não .eq(); e a máscara BR é obrigatória. Ver memória clientes_omie_schema.

import { supabase } from './supabase';
import { fmtCnpjBR } from './utils';
import type { Conta, ContaFiltro } from './conta';

export interface IgnorarClientes {
  cnpjs: string[];
  codigos: string[];
  nomes: string[];
  loadedAt: number;
}

const ignorarClientesCache: Record<string, IgnorarClientes> = {};
const IGNORAR_CACHE_TTL_MS = 5 * 60 * 1000;

/** Invalida o cache (após CRUD em ignorar_clientes). conta undefined = tudo. */
export function invalidarIgnorarCache(conta?: Conta): void {
  if (conta) delete ignorarClientesCache[conta];
  else Object.keys(ignorarClientesCache).forEach((k) => delete ignorarClientesCache[k]);
}

/** Resolve CNPJs ignorados → códigos/nomes de cliente (cache 5 min por conta). */
export async function getIgnorarClientes(conta: ContaFiltro): Promise<IgnorarClientes> {
  const k = conta || '__TODAS__';
  const cached = ignorarClientesCache[k];
  if (cached && Date.now() - cached.loadedAt < IGNORAR_CACHE_TTL_MS) return cached;

  let q = supabase.from('ignorar_clientes').select('cnpj,nome');
  if (conta) q = q.eq('conta_omie', conta);
  const { data } = await q;
  const registros = (data || []) as Array<{ cnpj?: string; nome?: string }>;
  const cnpjs = registros.map((r) => (r.cnpj || '').replace(/\D/g, '')).filter(Boolean);
  const nomesDoRegistro = registros.map((r) => r.nome).filter(Boolean) as string[];

  const codigos: string[] = [];
  const nomesResolvidos: string[] = [];
  for (const cnpj of cnpjs) {
    try {
      const fmt = fmtCnpjBR(cnpj);
      const { data: cli } = await supabase
        .from('Clientes_Omie')
        .select('id,nome')
        .filter('cpf/cnpj', 'eq', fmt)
        .limit(1);
      if (cli && cli[0]) {
        if (cli[0].id) codigos.push(String(cli[0].id));
        if (cli[0].nome) nomesResolvidos.push(String(cli[0].nome));
      }
    } catch {
      /* ignora */
    }
  }
  const nomes = [...new Set([...nomesResolvidos, ...nomesDoRegistro])];

  const result: IgnorarClientes = { cnpjs, codigos, nomes, loadedAt: Date.now() };
  ignorarClientesCache[k] = result;
  return result;
}

/**
 * Códigos+nomes para aplicar inline no call site. NÃO retorna query builder
 * (builders Supabase são thenable; async function que retorna thenable resolve
 * a thenable em vez do builder). Ver memória supabase_thenable_async.
 */
export async function getIgnorarFiltro(conta: ContaFiltro): Promise<{ codigos: string[]; nomes: string[] }> {
  const { codigos, nomes } = await getIgnorarClientes(conta);
  return { codigos, nomes };
}
