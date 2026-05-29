// =====================================================================
// MATCHING OMIE — Vendedor e Projeto (compartilhado)
//
// Reaproveita a lógica original de src/lib/pos/omie.ts:
//   buscarNcodVend()  → buscarVendedorPorNome()  (NFD + lowercase + includes, com fallback p/ 2 técnicos)
//   buscarNcodProj()  → buscarProjetoPorNome()   (3 estratégias: exato, contém, contido)
//
// Diferenças desta versão:
//   1. Aceita OmieAccount (key/secret) por parâmetro — multi-empresa.
//   2. Cache separado por acc.name.
//   3. Fallback Dice (bigramas, threshold 0.7) quando match direto falha.
//   4. Para placa/chassi, também tenta isolar o "token" alfanumérico mais longo (≥6).
// =====================================================================

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

export interface OmieAccountLike {
  name: string;
  key: string;
  secret: string;
}

export interface VendedorOmie { codigo: number; nome: string }
export interface ProjetoOmie  { codigo: number; nome: string }

// --- Client HTTP local (idêntico em comportamento ao omie-contapagar.ts) ---
async function omieCall<T>(
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  acc: OmieAccountLike,
): Promise<T> {
  const response = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });

  if (response.status === 429) {
    console.warn(`[Omie matching ${acc.name}] Rate limit (${call}) — aguardando 30s...`);
    await new Promise((r) => setTimeout(r, 30000));
    return omieCall(endpoint, call, param, acc);
  }

  const data = await response.json().catch(() => ({}));
  if (data?.faultstring) {
    throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  }
  return data as T;
}

// =====================================================================
// HELPERS DE NORMALIZAÇÃO (delegados para lib centralizada)
// =====================================================================

import { normName } from "@/lib/tecnico-utils";

function norm(s: string): string {
  return normName(s || "");
}

/** Dice coefficient (bigramas). Retorna [0..1]; >=0.7 ~ "muito similar". */
function dice(a: string, b: string): number {
  const A = norm(a), B = norm(b);
  if (A.length < 2 || B.length < 2) return A === B ? 1 : 0;
  const bigramsA = new Map<string, number>();
  for (let i = 0; i < A.length - 1; i++) {
    const g = A.substring(i, i + 2);
    bigramsA.set(g, (bigramsA.get(g) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < B.length - 1; i++) {
    const g = B.substring(i, i + 2);
    const count = bigramsA.get(g) || 0;
    if (count > 0) { intersection++; bigramsA.set(g, count - 1); }
  }
  return (2 * intersection) / ((A.length - 1) + (B.length - 1));
}

/** Extrai o token alfanumérico mais longo (≥6 chars). Útil para placa/chassi. */
function extrairToken(s: string): string {
  const matches = (s || "").match(/[A-Z0-9]{6,}/gi) || [];
  return matches.sort((a, b) => b.length - a.length)[0] || "";
}

// =====================================================================
// VENDEDORES
// =====================================================================

const cacheVendedoresLista = new Map<string, VendedorOmie[]>();        // por acc.name
const cacheVendedorPorNome = new Map<string, number | null>();         // `${acc.name}|${nome1}|${nome2}`

export async function carregarVendedoresOmie(acc: OmieAccountLike): Promise<VendedorOmie[]> {
  if (cacheVendedoresLista.has(acc.name)) return cacheVendedoresLista.get(acc.name)!;
  const out: VendedorOmie[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const r = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/vendedores/", "ListarVendedores", { pagina, registros_por_pagina: 50 }, acc);
    if (pagina === 1) totalPaginas = r?.total_de_paginas || 1;
    for (const v of r?.cadastro || []) {
      if (v.inativo !== "S") out.push({ codigo: v.codigo, nome: v.nome });
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise((r) => setTimeout(r, 400));
  }
  cacheVendedoresLista.set(acc.name, out);
  return out;
}

export interface MatchResult {
  codigo: number | null;
  aproximado: boolean;          // true se caiu no fallback Dice
  score?: number;                // score Dice quando aproximado
}

/**
 * Busca um vendedor no Omie por nome. Suporta um técnico (nome2 vazio) ou dois.
 * Replica EXATAMENTE a lógica de src/lib/pos/omie.ts:263-307, com fallback Dice quando falha.
 */
export async function buscarVendedorPorNome(
  nome1: string,
  nome2: string | undefined,
  acc: OmieAccountLike,
): Promise<MatchResult> {
  const t1 = (nome1 || "").trim();
  const t2 = (nome2 || "").trim();
  if (!t1) return { codigo: null, aproximado: false };

  const chave = `${acc.name}|${t1}|${t2}`;
  if (cacheVendedorPorNome.has(chave)) {
    return { codigo: cacheVendedorPorNome.get(chave)!, aproximado: false };
  }

  const vendedores = await carregarVendedoresOmie(acc);
  const n1 = norm(t1);
  const n2 = t2 ? norm(t2) : "";

  // --- Estratégia 1: includes() (igual ao pos/omie.ts) ---
  for (const v of vendedores) {
    const nv = norm(v.nome);
    if (t2) {
      if (nv.includes(n1) && nv.includes(n2)) {
        cacheVendedorPorNome.set(chave, v.codigo);
        return { codigo: v.codigo, aproximado: false };
      }
    } else {
      if (nv.includes(n1) && !nv.includes("//") && !nv.includes("///")) {
        cacheVendedorPorNome.set(chave, v.codigo);
        return { codigo: v.codigo, aproximado: false };
      }
    }
  }

  // --- Estratégia 2 (só 1 técnico): aceita combinação ---
  if (!t2) {
    for (const v of vendedores) {
      if (norm(v.nome).includes(n1)) {
        cacheVendedorPorNome.set(chave, v.codigo);
        return { codigo: v.codigo, aproximado: false };
      }
    }
  }

  // --- Fallback: Dice score (≥0.7) ---
  let melhor: { codigo: number; score: number } | null = null;
  for (const v of vendedores) {
    const score = dice(t1, v.nome);
    if (score >= 0.7 && (!melhor || score > melhor.score)) {
      melhor = { codigo: v.codigo, score };
    }
  }
  if (melhor) {
    cacheVendedorPorNome.set(chave, melhor.codigo);
    return { codigo: melhor.codigo, aproximado: true, score: melhor.score };
  }

  console.warn(`[Omie matching ${acc.name}] Vendedor não encontrado: "${t1}"${t2 ? ` + "${t2}"` : ""}`);
  cacheVendedorPorNome.set(chave, null);
  return { codigo: null, aproximado: false };
}

// =====================================================================
// PROJETOS
// =====================================================================

const cacheProjetosLista = new Map<string, ProjetoOmie[]>();           // por acc.name
const cacheProjetoPorNome = new Map<string, number | null>();          // `${acc.name}|${nome}`

async function carregarProjetosOmie(acc: OmieAccountLike): Promise<ProjetoOmie[]> {
  if (cacheProjetosLista.has(acc.name)) return cacheProjetosLista.get(acc.name)!;
  const out: ProjetoOmie[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const r = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/projetos/", "ListarProjetos", { pagina, registros_por_pagina: 100 }, acc);
    if (pagina === 1) totalPaginas = r?.total_de_paginas || 1;
    for (const p of r?.cadastro || []) {
      if (p.inativo !== "S") out.push({ codigo: p.codigo, nome: p.nome });
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise((r) => setTimeout(r, 300));
  }
  cacheProjetosLista.set(acc.name, out);
  return out;
}

/**
 * Busca um projeto no Omie pelo nome. Replica src/lib/pos/omie.ts:195-235:
 *   1. nome === alvo
 *   2. nome.includes(alvo)
 *   3. alvo.includes(nome)
 * + fallback Dice.
 * + tentativa extra com o token alfanumérico mais longo (placa/chassi).
 */
export async function buscarProjetoPorNome(
  projetoNome: string,
  acc: OmieAccountLike,
): Promise<MatchResult> {
  const alvo = (projetoNome || "").trim();
  if (!alvo) return { codigo: null, aproximado: false };

  const chave = `${acc.name}|${alvo}`;
  if (cacheProjetoPorNome.has(chave)) {
    return { codigo: cacheProjetoPorNome.get(chave)!, aproximado: false };
  }

  const projetos = await carregarProjetosOmie(acc);

  // --- Estratégia 1, 2, 3: exato / contém / contido (igual ao pos/omie.ts) ---
  for (const p of projetos) {
    if (p.nome === alvo || p.nome.includes(alvo) || alvo.includes(p.nome)) {
      cacheProjetoPorNome.set(chave, p.codigo);
      return { codigo: p.codigo, aproximado: false };
    }
  }

  // --- Estratégia extra: tenta match isolando o token alfanumérico (placa/chassi) ---
  const token = extrairToken(alvo);
  if (token && token !== alvo) {
    for (const p of projetos) {
      if (p.nome === token || p.nome.includes(token) || token.includes(p.nome)) {
        cacheProjetoPorNome.set(chave, p.codigo);
        return { codigo: p.codigo, aproximado: false };
      }
    }
  }

  // --- Fallback: Dice score (≥0.7) ---
  let melhor: { codigo: number; score: number } | null = null;
  for (const p of projetos) {
    const score = Math.max(dice(alvo, p.nome), token ? dice(token, p.nome) : 0);
    if (score >= 0.7 && (!melhor || score > melhor.score)) {
      melhor = { codigo: p.codigo, score };
    }
  }
  if (melhor) {
    cacheProjetoPorNome.set(chave, melhor.codigo);
    return { codigo: melhor.codigo, aproximado: true, score: melhor.score };
  }

  console.warn(`[Omie matching ${acc.name}] Projeto não encontrado: "${alvo}"`);
  cacheProjetoPorNome.set(chave, null);
  return { codigo: null, aproximado: false };
}

// =====================================================================
// INVALIDAÇÃO DE CACHE (útil para refresh-cache)
// =====================================================================

export function invalidarCacheMatching(acc?: OmieAccountLike): void {
  if (acc) {
    cacheVendedoresLista.delete(acc.name);
    cacheProjetosLista.delete(acc.name);
    // limpar entradas por nome dessa empresa
    for (const k of Array.from(cacheVendedorPorNome.keys())) {
      if (k.startsWith(`${acc.name}|`)) cacheVendedorPorNome.delete(k);
    }
    for (const k of Array.from(cacheProjetoPorNome.keys())) {
      if (k.startsWith(`${acc.name}|`)) cacheProjetoPorNome.delete(k);
    }
  } else {
    cacheVendedoresLista.clear();
    cacheProjetosLista.clear();
    cacheVendedorPorNome.clear();
    cacheProjetoPorNome.clear();
  }
}
