// =============================================================================
// MEMÓRIA ÚNICA do Tratorilson — as regras ensinadas pelo dev/admin valem pros
// DOIS Tratorilsons (chat do portal E atendimento de clientes no NovaZap).
//
// Tabela: tratorilson_memoria (id, conteudo, ativo, criado_por, updated_at,
// escopo, modulo).
//  - escopo = ONDE a regra vale: 'geral' (os dois), 'portal', 'clientes' (zap)
//  - modulo = BLOCO do assunto: 'geral', 'chatwoot', 'pos', 'ppv',
//    'requisicoes', 'financeiro', 'revisoes' — organiza o prompt e o painel
// Colunas ausentes (migração pendente) são toleradas: tudo cai em 'geral'.
// =============================================================================

export interface RegraMemoria {
  id: number;
  conteudo: string;
  escopo: string;
  modulo: string;
}

export const MODULOS_MEMORIA: Record<string, string> = {
  geral: "GERAL",
  chatwoot: "WHATSAPP / NOVAZAP",
  revisoes: "REVISÕES E ORÇAMENTOS",
  pos: "PÓS-VENDAS (OS)",
  ppv: "PEÇAS (PPV)",
  requisicoes: "REQUISIÇÕES",
  financeiro: "FINANCEIRO",
};

/** Normaliza "modulo" com submódulo opcional por caminho: "ppv/catalogo".
 *  Base desconhecida vira 'geral'; o submódulo é slug livre (ex.: catalogo). */
export function normalizarModulo(raw: unknown): string {
  const partes = String(raw || "geral").toLowerCase().trim().split("/");
  const base = MODULOS_MEMORIA[partes[0]] ? partes[0] : "geral";
  const sub = partes.slice(1).join("/")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return sub ? `${base}/${sub}` : base;
}

/** Rótulo de exibição de um módulo (com submódulo): "PEÇAS (PPV) › CATÁLOGO". */
export function rotuloModulo(modulo: string): string {
  const [base, ...resto] = String(modulo || "geral").split("/");
  const rot = MODULOS_MEMORIA[base] || MODULOS_MEMORIA.geral;
  const sub = resto.join("/");
  return sub ? `${rot} › ${sub.replace(/-/g, " ").toUpperCase()}` : rot;
}

const SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const HEADERS = () => ({ apikey: SK(), authorization: `Bearer ${SK()}` });

/** Regras ativas que valem pros escopos dados (sempre inclua 'geral'). */
export async function carregarMemoria(escopos: string[]): Promise<RegraMemoria[]> {
  const base = `${SB()}/rest/v1/tratorilson_memoria`;
  const lista = escopos.map((e) => `"${e}"`).join(",");
  try {
    const r = await fetch(`${base}?ativo=eq.true&escopo=in.(${lista})&select=id,conteudo,escopo,modulo&order=id.asc`, { headers: HEADERS() });
    if (r.ok) {
      const d: any[] = await r.json().catch(() => []);
      return d.map((m) => ({ id: m.id, conteudo: String(m.conteudo || ""), escopo: String(m.escopo || "geral"), modulo: String(m.modulo || "geral") }));
    }
  } catch { /* cai no fallback */ }
  // Fallback 1: sem a coluna modulo
  try {
    const r = await fetch(`${base}?ativo=eq.true&escopo=in.(${lista})&select=id,conteudo,escopo&order=id.asc`, { headers: HEADERS() });
    if (r.ok) {
      const d: any[] = await r.json().catch(() => []);
      return d.map((m) => ({ id: m.id, conteudo: String(m.conteudo || ""), escopo: String(m.escopo || "geral"), modulo: "geral" }));
    }
  } catch { /* cai no fallback 2 */ }
  // Fallback 2: sem escopo nem modulo — tudo 'geral'
  try {
    const r = await fetch(`${base}?ativo=eq.true&select=id,conteudo&order=id.asc`, { headers: HEADERS() });
    if (!r.ok) return [];
    const d: any[] = await r.json().catch(() => []);
    return d.map((m) => ({ id: m.id, conteudo: String(m.conteudo || ""), escopo: "geral", modulo: "geral" }));
  } catch { return []; }
}

/** Bloco pronto pro system prompt, ORGANIZADO POR MÓDULO (vazio se não houver regras). */
export async function blocoMemoria(escopos: string[], titulo = "REGRAS ENSINADAS (memória — siga SEMPRE)"): Promise<string> {
  const regras = await carregarMemoria(escopos);
  if (!regras.length) return "";
  const porModulo = new Map<string, RegraMemoria[]>();
  for (const m of regras) {
    const chave = normalizarModulo(m.modulo);
    if (!porModulo.has(chave)) porModulo.set(chave, []);
    porModulo.get(chave)!.push(m);
  }
  // ordem: módulos conhecidos; submódulos logo depois da base, em ordem alfabética
  const chaves = [...porModulo.keys()].sort((a, b) => {
    const ia = Object.keys(MODULOS_MEMORIA).indexOf(a.split("/")[0]);
    const ib = Object.keys(MODULOS_MEMORIA).indexOf(b.split("/")[0]);
    return ia - ib || a.localeCompare(b);
  });
  let texto = `\n\n${titulo}:`;
  for (const mod of chaves) {
    texto += `\n\n[${rotuloModulo(mod)}]`;
    for (const m of porModulo.get(mod)!) texto += `\n- [#${m.id}] ${m.conteudo}`;
  }
  return texto;
}

/** Grava uma regra nova; tolera colunas ausentes. Devolve o id ou null. */
export async function gravarRegra(conteudo: string, escopo: string, criadoPor: string, modulo = "geral"): Promise<number | null> {
  const base = `${SB()}/rest/v1/tratorilson_memoria`;
  const h = { ...HEADERS(), "Content-Type": "application/json", Prefer: "return=representation" };
  const tentativas: Record<string, unknown>[] = [
    { conteudo, escopo, modulo, criado_por: criadoPor },
    { conteudo, escopo, criado_por: criadoPor },
    { conteudo, criado_por: criadoPor },
  ];
  for (const body of tentativas) {
    const r = await fetch(base, { method: "POST", headers: h, body: JSON.stringify(body) });
    if (r.ok) {
      const d = await r.json().catch(() => []);
      return d?.[0]?.id ?? null;
    }
  }
  return null;
}
