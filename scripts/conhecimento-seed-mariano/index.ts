// Material de uso para o Mariano (26/11/2026): Proposta → Demonstração → Pedido de Máquinas →
// Baixar contas → Correção de contas → Boletos de fornecedor → Solicitação de Compras.
//
//   npx tsx --env-file=.env.local scripts/conhecimento-seed-mariano/index.ts [--sobrescrever]
//
// Grava cada artigo como RASCUNHO em kb_artigos (origem "ia"), idempotente pelo slug: artigo que já
// existe só é regravado com --sobrescrever e enquanto ainda for rascunho nunca publicado. O responsável
// do módulo publica em /conhecimento (aba "Para aprovar"); publicado, o artigo aparece no "?" da tela.
// Depois de publicar: scripts/treinamento-seed-mariano.ts cria a trilha e atribui ao Mariano.
import { createClient } from "@supabase/supabase-js";
import { textoDeBusca } from "../../src/lib/conhecimento/blocos";
import type { ArtigoSeed } from "./tipos";
import { PROPOSTAS } from "./propostas";
import { REMESSAS } from "./remessas";
import { FINANCEIRO } from "./financeiro";
import { TICKETS } from "./tickets";
import { FINANCEIRO_CAIXA } from "./financeiro-caixa";
import { FINANCEIRO_LANCAR } from "./financeiro-lancar";

// 26/11 tarde: + Começando/Hoje, Vencidos, Lançar conta e Recibos (trilha da Elizabete, Financeiro).
export const ARTIGOS: ArtigoSeed[] = [...PROPOSTAS, ...REMESSAS, ...FINANCEIRO, ...TICKETS, ...FINANCEIRO_CAIXA, ...FINANCEIRO_LANCAR];

const AUTOR = "Nova Tratores";

async function main() {
  const sobrescrever = process.argv.includes("--sobrescrever");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (.env.local)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: existentes, error: e0 } = await sb.from("kb_artigos").select("slug, status, versao").in("slug", ARTIGOS.map((a) => a.slug));
  if (e0) throw new Error(`kb_artigos: ${e0.message}`);
  const porSlug = new Map((existentes || []).map((r) => [r.slug as string, r]));

  let criados = 0, atualizados = 0, pulados = 0;
  for (const a of ARTIGOS) {
    const linha = {
      slug: a.slug, titulo: a.titulo, tipo: a.tipo, modulo: a.modulo, telas: a.telas, fontes: a.fontes,
      resumo: a.resumo.slice(0, 200), corpo: a.corpo, tags: a.tags, publico: [], ordem: a.ordem,
      status: "rascunho", versao: 0, origem: "ia",
      texto_busca: textoDeBusca(a.titulo, a.resumo, a.corpo, a.tags),
      criado_por_nome: AUTOR, rascunho_por: AUTOR, rascunho_em: new Date().toISOString(),
    };
    const ja = porSlug.get(a.slug);
    if (ja) {
      if (!sobrescrever || ja.status !== "rascunho" || Number(ja.versao) > 0) { pulados++; console.log("pulado", a.slug, `(${ja.status} v${ja.versao})`); continue; }
      const { error } = await sb.from("kb_artigos").update({ ...linha, atualizado_em: new Date().toISOString() }).eq("slug", a.slug);
      if (error) throw new Error(`${a.slug}: ${error.message}`);
      atualizados++; console.log("atualizado", a.slug); continue;
    }
    const { error } = await sb.from("kb_artigos").insert(linha);
    if (error) throw new Error(`${a.slug}: ${error.message}`);
    criados++; console.log("criado", a.slug);
  }
  console.log(`criados ${criados} · atualizados ${atualizados} · pulados ${pulados}`);
  console.log("Próximo: /conhecimento → \"Para aprovar\" → publicar; depois scripts/treinamento-seed-mariano.ts");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
