// Troca códigos por nomes nas diferenças da conferência (conta corrente,
// categoria, departamento) usando os espelhos do banco. Sem nome, fica o código.
import { supabase } from "@/lib/pos/supabase";
import type { ResultadoConferencia } from "@/lib/omie/conferencia";

const TABELA: Record<string, string> = { conta: "conta_corrente", categoria: "categoria", departamentos: "departamento" };

export async function nomearDivergencias(lista: (ResultadoConferencia | null)[]): Promise<void> {
  const docs = lista.filter(Boolean) as ResultadoConferencia[];
  const alvo = docs.flatMap((d) => d.divergencias.filter((x) => TABELA[x.campo]));
  if (!alvo.length) return;
  const nomes: Record<string, Record<string, string>> = {};
  for (const [campo, tabela] of Object.entries(TABELA)) {
    const codigos = new Set<string>();
    for (const x of alvo.filter((a) => a.campo === campo)) for (const v of [x.portal, x.omie]) for (const m of v.match(/[\d.]+/g) || []) codigos.add(m);
    if (!codigos.size) continue;
    try {
      const { data } = await supabase.from(tabela).select("codigo, descricao").in("codigo", Array.from(codigos));
      nomes[campo] = Object.fromEntries(((data || []) as { codigo: unknown; descricao: unknown }[]).map((r) => [String(r.codigo), String(r.descricao || "").replace(/\s+/g, " ").trim()]));
    } catch { /* sem nomes */ }
  }
  for (const x of alvo) {
    const mapa = nomes[x.campo] || {};
    const trocar = (v: string) => x.campo === "departamentos"
      ? v.replace(/\b(\d{6,})\b/g, (c) => mapa[c] || c)
      : (mapa[v] ? `${mapa[v]} (${v})` : v);
    x.portal = trocar(x.portal);
    x.omie = trocar(x.omie);
  }
}
