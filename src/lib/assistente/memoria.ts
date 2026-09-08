// =============================================================================
// MEMÓRIA ÚNICA do Tratorilson — as regras ensinadas pelo dev/admin valem pros
// DOIS Tratorilsons (chat do portal E atendimento de clientes no NovaZap).
//
// Tabela: tratorilson_memoria (id, conteudo, ativo, criado_por, updated_at,
// escopo). O escopo diz ONDE a regra vale:
//   'geral'    → nos dois (padrão)
//   'portal'   → só no chat interno do portal
//   'clientes' → só no atendimento de clientes (WhatsApp/NovaZap)
// Se a coluna `escopo` ainda não existir (migração pendente), tudo é tratado
// como 'geral' — a memória continua compartilhada, só sem separação.
// =============================================================================

export interface RegraMemoria {
  id: number;
  conteudo: string;
  escopo: string;
}

const SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const HEADERS = () => ({ apikey: SK(), authorization: `Bearer ${SK()}` });

/** Regras ativas que valem pros escopos dados (sempre inclua 'geral'). */
export async function carregarMemoria(escopos: string[]): Promise<RegraMemoria[]> {
  const base = `${SB()}/rest/v1/tratorilson_memoria`;
  try {
    const lista = escopos.map((e) => `"${e}"`).join(",");
    const r = await fetch(`${base}?ativo=eq.true&escopo=in.(${lista})&select=id,conteudo,escopo&order=id.asc`, { headers: HEADERS() });
    if (r.ok) {
      const d: any[] = await r.json().catch(() => []);
      return d.map((m) => ({ id: m.id, conteudo: String(m.conteudo || ""), escopo: String(m.escopo || "geral") }));
    }
  } catch { /* cai no fallback */ }
  // Fallback: coluna escopo ainda não existe — devolve tudo como 'geral'
  try {
    const r = await fetch(`${base}?ativo=eq.true&select=id,conteudo&order=id.asc`, { headers: HEADERS() });
    if (!r.ok) return [];
    const d: any[] = await r.json().catch(() => []);
    return d.map((m) => ({ id: m.id, conteudo: String(m.conteudo || ""), escopo: "geral" }));
  } catch { return []; }
}

/** Bloco pronto pro system prompt (vazio se não houver regras). */
export async function blocoMemoria(escopos: string[], titulo = "REGRAS ENSINADAS (memória — siga SEMPRE)"): Promise<string> {
  const regras = await carregarMemoria(escopos);
  if (!regras.length) return "";
  return `\n\n${titulo}:\n` + regras.map((m) => `- [#${m.id}] ${m.conteudo}`).join("\n");
}

/** Grava uma regra nova; tolera a coluna escopo ausente. Devolve o id ou null. */
export async function gravarRegra(conteudo: string, escopo: string, criadoPor: string): Promise<number | null> {
  const base = `${SB()}/rest/v1/tratorilson_memoria`;
  const h = { ...HEADERS(), "Content-Type": "application/json", Prefer: "return=representation" };
  let r = await fetch(base, { method: "POST", headers: h, body: JSON.stringify({ conteudo, escopo, criado_por: criadoPor }) });
  if (!r.ok) {
    // coluna escopo pode não existir ainda
    r = await fetch(base, { method: "POST", headers: h, body: JSON.stringify({ conteudo, criado_por: criadoPor }) });
    if (!r.ok) return null;
  }
  const d = await r.json().catch(() => []);
  return d?.[0]?.id ?? null;
}
