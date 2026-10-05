// Carga inicial da base de conhecimento a partir de um guia em markdown.
//
//   npx tsx scripts/conhecimento-seed-guia.ts [--arquivo docs/guia-pos-venda-regras.md] [--dry] [--sobrescrever]
//
// Cada "## N. Título (/rota)" do guia vira uma tela; cada linha em **negrito**
// vira um artigo daquela tela (lib/conhecimento/guia.ts). Tudo entra como
// RASCUNHO (origem 'seed'): nada aparece para o leitor até o responsável do
// módulo publicar em /conhecimento (aba "Para aprovar").
//
// Idempotente por slug: artigo que já existe é pulado (não apaga edição feita
// na tela), a menos que --sobrescrever — e mesmo assim só se ainda for rascunho
// nunca publicado.
//
// Precisa de sql/conhecimento-base.sql aplicada e das chaves no .env.local.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { dividirGuia } from "../src/lib/conhecimento/guia";
import { slugify, textoDeBusca } from "../src/lib/conhecimento/blocos";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes("--dry");
const SOBRESCREVER = args.includes("--sobrescrever");
const ARQUIVO = opt("--arquivo") || "docs/guia-pos-venda-regras.md";

// fontes de código vigiadas na fase 2 (mudança do sistema → artigo em revisão)
const FONTES: Record<string, string[]> = {
  pos: ["src/app/(portal)/(servicos)/pos/**", "src/components/pos/**", "src/lib/pos/**", "src/app/api/pos/**"],
  garantias: ["src/app/(portal)/(servicos)/garantias/**", "src/components/garantias/**", "src/lib/garantias/**", "src/app/api/garantias/**"],
  revisoes: ["src/app/(portal)/revisoes/**", "src/components/revisoes/**", "src/lib/revisoes/**", "src/app/api/revisoes/**"],
  sat: ["src/app/(portal)/(servicos)/sat/**", "src/app/api/sat/**"],
  ppv: ["src/app/(portal)/ppv/**", "src/components/ppv/**", "src/lib/ppv/**", "src/app/api/ppv/**"],
  feedbacks: ["src/app/(portal)/feedbacks/**", "src/components/feedbacks/**", "src/lib/feedbacks/**", "src/app/api/feedbacks/**"],
  requisicoes: ["src/app/(portal)/requisicoes/**", "src/components/requisicoes/**", "src/lib/requisicoes/**", "src/app/api/requisicoes/**"],
  tickets: ["src/app/(portal)/tickets/**", "src/components/tickets/**", "src/lib/tickets/**", "src/app/api/tickets/**"],
};

function lerEnv(): Record<string, string> {
  const p = path.resolve(".env.local");
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs.readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
}

async function main() {
  const md = fs.readFileSync(path.resolve(ARQUIVO), "utf8");
  const artigos = dividirGuia(md);
  const porTela = new Map<string, number>();
  for (const a of artigos) porTela.set(a.tela, (porTela.get(a.tela) ?? 0) + 1);
  console.log(`${ARQUIVO}: ${artigos.length} artigos em ${porTela.size} telas`);
  for (const [tela, n] of porTela) console.log(`  ${tela.padEnd(14)} ${n}`);
  if (DRY) {
    for (const a of artigos) console.log(`  - [${a.modulo}] ${a.titulo} (${a.corpo.length} blocos)`);
    return;
  }

  const env = { ...lerEnv(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (.env.local)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: existentes, error: e0 } = await sb.from("kb_artigos").select("slug, status, versao");
  if (e0) throw new Error(`kb_artigos: ${e0.message} — a migration sql/conhecimento-base.sql foi aplicada?`);
  const porSlug = new Map((existentes || []).map((r) => [r.slug as string, r]));

  let criados = 0, pulados = 0, atualizados = 0;
  for (const a of artigos) {
    const slug = slugify(`${a.modulo} ${a.titulo}`);
    const resumo = `${a.secao}: ${a.titulo.toLowerCase()}.`.slice(0, 200);
    const linha = {
      slug, titulo: a.titulo, tipo: "regra", modulo: a.modulo, telas: [a.tela], fontes: FONTES[a.modulo] ?? [`src/**/${a.modulo}/**`],
      resumo, corpo: a.corpo, tags: [a.modulo, "guia pós-venda"], publico: [], ordem: a.ordem, status: "rascunho", versao: 0, origem: "seed",
      texto_busca: textoDeBusca(a.titulo, resumo, a.corpo, [a.modulo]),
      criado_por_nome: "seed (guia do Pós-Venda)", rascunho_por: "seed (guia do Pós-Venda)", rascunho_em: new Date().toISOString(),
    };
    const ja = porSlug.get(slug);
    if (ja) {
      if (!SOBRESCREVER || ja.status !== "rascunho" || Number(ja.versao) > 0) { pulados++; continue; }
      const { error } = await sb.from("kb_artigos").update({ ...linha, atualizado_em: new Date().toISOString() }).eq("slug", slug);
      if (error) throw error;
      atualizados++;
      continue;
    }
    const { error } = await sb.from("kb_artigos").insert(linha);
    if (error) throw new Error(`${slug}: ${error.message}`);
    criados++;
  }
  console.log(`criados ${criados} · atualizados ${atualizados} · pulados ${pulados}`);
  console.log("Próximo passo: /conhecimento → aba \"Para aprovar\" → o responsável revisa e publica.");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
