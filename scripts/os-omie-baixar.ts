// Baixa uma OS direto da Omie (ConsultarOS) e gera um HTML no layout que imita
// a Omie — o MESMO render de /api/clientes/print (reaproveita src/lib/omie/os-print).
// Roda LOCAL, lendo as credenciais do .env.local. Não precisa subir o Next.
//
// Uso:
//   npx tsx scripts/os-omie-baixar.ts --numero 12345 --empresa NOVA
//   npx tsx scripts/os-omie-baixar.ts --cod 987654321 --empresa CASTRO
//
// Flags:
//   --numero N            número da OS (o cNumOS que você vê). Resolve o nCodOS via ListarOS.
//   --cod N               nCodOS (ID interno Omie) — pula o ListarOS, mais rápido.
//   --empresa NOVA|CASTRO default NOVA.
//   --de DD/MM/AAAA       início da janela do ListarOS (default: 12 meses atrás).
//   --ate DD/MM/AAAA      fim da janela do ListarOS (default: hoje).
//   --saida caminho.html  onde gravar (default: scratchpad/os-<numero>-<empresa>.html).
//
// Ao final imprime o caminho do .html e do .json (ConsultarOS cru, p/ depurar).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function flag(nome: string): string | undefined {
  const i = process.argv.indexOf("--" + nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function dataBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function main() {
  // As credenciais têm de estar em process.env ANTES de importar o os-print
  // (ele monta OMIE_ACCOUNTS no escopo do módulo). Por isso o import é dinâmico.
  const env = lerEnvLocal();
  for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
  // contaOmie("Nova Tratores") lê OMIE_APP_KEY/SECRET (nomes legados que existem
  // no Railway). Localmente o .env.local só tem os *_NOVA — mapeia como fallback.
  if (!process.env.OMIE_APP_KEY && process.env.OMIE_APP_KEY_NOVA) process.env.OMIE_APP_KEY = process.env.OMIE_APP_KEY_NOVA;
  if (!process.env.OMIE_APP_SECRET && process.env.OMIE_APP_SECRET_NOVA) process.env.OMIE_APP_SECRET = process.env.OMIE_APP_SECRET_NOVA;

  const numeroArg = flag("numero");
  const codArg = flag("cod");
  const empresaArg = (flag("empresa") || "NOVA").toUpperCase();
  const empresa = empresaArg.startsWith("CAST") ? "Castro Pecas" : "Nova Tratores";
  const empresaTag = empresaArg.startsWith("CAST") ? "CASTRO" : "NOVA";

  if (!numeroArg && !codArg) {
    console.error("Informe --numero <N> (número da OS) ou --cod <nCodOS>. Ex.:");
    console.error("  npx tsx scripts/os-omie-baixar.ts --numero 12345 --empresa NOVA");
    process.exit(1);
  }

  const { renderOS, omieCall, getAccount } = await import("../src/lib/omie/os-print");
  const acc = getAccount(empresa);

  // 1. Resolver o nCodOS
  let nCodOS: number;
  let numeroLabel = numeroArg || "";
  if (codArg) {
    nCodOS = Number(codArg);
    console.error(`nCodOS informado direto: ${nCodOS}`);
  } else {
    const hoje = new Date();
    const dozeMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 12, hoje.getDate());
    const de = flag("de") || dataBR(dozeMesesAtras);
    const ate = flag("ate") || dataBR(hoje);
    const alvo = String(numeroArg).trim();
    console.error(`Procurando OS nº ${alvo} (${empresaTag}) via ListarOS em ${de}..${ate} …`);

    let achou: any = null;
    let pagina = 1;
    while (true) {
      const data: any = await omieCall("/servicos/os/", "ListarOS", {
        pagina,
        registros_por_pagina: 50,
        filtrar_por_data_de: de,
        filtrar_por_data_ate: ate,
      }, acc);
      const registros: any[] = data.osCadastro || [];
      achou = registros.find((os) => String(os.Cabecalho?.cNumOS).trim() === alvo);
      console.error(`  página ${pagina}/${data.total_de_paginas} (${registros.length} OS)${achou ? " → ACHOU" : ""}`);
      if (achou) break;
      if (pagina >= (data.total_de_paginas || 1)) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!achou) {
      console.error(`\nNão achei a OS nº ${alvo} na janela ${de}..${ate}.`);
      console.error("Tente ampliar com --de/--ate (a data do ListarOS é a de inclusão/previsão da OS).");
      process.exit(2);
    }
    nCodOS = achou.Cabecalho.nCodOS;
    console.error(`nCodOS = ${nCodOS}`);
  }

  // 2. ConsultarOS cru (para depurar) + render HTML
  const raw: any = await omieCall("/servicos/os/", "ConsultarOS", { nCodOS }, acc);
  if (!numeroLabel) numeroLabel = String(raw.Cabecalho?.cNumOS || nCodOS);
  const html = await renderOS(nCodOS, empresa, raw);

  const baseNome = `os-${String(numeroLabel).replace(/[^\w.-]/g, "_")}-${empresaTag}`;
  const saidaHtml = flag("saida") || resolve(tmpdir(), `${baseNome}.html`);
  const saidaJson = resolve(tmpdir(), `${baseNome}.json`);

  writeFileSync(saidaHtml, html, "utf8");
  writeFileSync(saidaJson, JSON.stringify(raw, null, 2), "utf8");

  console.error(`\nOK — OS nº ${numeroLabel} (${empresaTag}), total R$ ${raw.Cabecalho?.nValorTotal ?? "?"}`);
  console.log(saidaHtml);
  console.error(`JSON cru: ${saidaJson}`);
}

main().catch((err) => {
  console.error("FALHA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
