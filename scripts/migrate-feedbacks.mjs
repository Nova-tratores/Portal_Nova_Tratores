// =============================================================================
// Migração one-shot: NT-FEEDBACKS-SITE → módulo Feedbacks do Portal.
//
// Lê das tabelas `feedbacks` e `clientes_info` do Supabase legado
// (kqsuznpywnmanrcougpv) e escreve em `feedback_registros` e
// `feedback_clientes_info` neste projeto (citrhumdkfivdzbmayde).
//
// Antes de rodar, garanta que:
//   1. sql/create-feedbacks-module.sql foi aplicado no Supabase destino
//   2. As 2 chaves anon estão exportadas no shell:
//        $env:OLD_SUPABASE_KEY = "sb_publishable_lhtZbdC6DcdJrGiAOO2ZmA_RwrYUSQ_"
//        $env:NEW_SUPABASE_KEY = "<anon key do projeto citrhumdkfivdzbmayde>"
//
// Rodar:  node scripts/migrate-feedbacks.mjs
//
// Idempotente: usa upsert nas chaves naturais (id em feedback_registros e
// cliente_key em feedback_clientes_info). Rodar de novo só atualiza.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const OLD_URL = "https://kqsuznpywnmanrcougpv.supabase.co";
const NEW_URL = "https://citrhumdkfivdzbmayde.supabase.co";

const OLD_KEY = process.env.OLD_SUPABASE_KEY;
const NEW_KEY = process.env.NEW_SUPABASE_KEY;

if (!OLD_KEY || !NEW_KEY) {
  console.error("ERRO: exporte OLD_SUPABASE_KEY e NEW_SUPABASE_KEY no shell antes de rodar.");
  process.exit(1);
}

const origem  = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const destino = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

const LOTE = 500;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// -----------------------------------------------------------------------------
// feedbacks → feedback_registros
// -----------------------------------------------------------------------------
async function migrarFeedbacks() {
  console.log("\n=== feedbacks → feedback_registros ===");

  const { data, error } = await origem.from("feedbacks").select("*");
  if (error) throw new Error("origem.feedbacks: " + error.message);

  console.log(`  origem: ${data.length} registros`);

  // Mapear: tentativas vinha como string JSON, agora vai como JSONB nativo
  const linhas = data.map((r) => {
    let tentativas = [];
    if (r.tentativas) {
      if (typeof r.tentativas === "string") {
        try { tentativas = JSON.parse(r.tentativas) || []; } catch { tentativas = []; }
      } else if (Array.isArray(r.tentativas)) {
        tentativas = r.tentativas;
      }
    }

    return {
      // preserva id original para idempotência e rastreabilidade
      id: r.id,
      tipo: r.tipo,
      nome: r.nome,
      telefone: r.telefone,
      trator: r.trator,
      tecnico: r.tecnico,
      codigo_omie: r.codigo_omie,
      data_contato: r.data_contato,

      servico: r.servico,
      data_servico: r.data_servico,
      status_cliente: r.status_cliente,
      nota: r.nota,
      feedback: r.feedback,
      nps: r.nps,
      melhoria: r.melhoria,

      ultimo_servico: r.ultimo_servico,
      motivo: r.motivo,
      prioridade: r.prioridade,
      acao: r.acao,
      sem_resposta: r.sem_resposta || false,
      revisao_confirmada: r.revisao_confirmada,
      tentativas,

      criado_em: r.criado_em,
      atualizado_em: r.atualizado_em || r.criado_em,
    };
  });

  let ok = 0, erros = 0;
  for (const lote of chunk(linhas, LOTE)) {
    const { error: upErr } = await destino
      .from("feedback_registros")
      .upsert(lote, { onConflict: "id" });
    if (upErr) {
      erros += lote.length;
      console.error("  ERRO no lote:", upErr.message);
    } else {
      ok += lote.length;
      process.stdout.write(`  upsert: ${ok}/${linhas.length}\r`);
    }
  }
  console.log(`\n  destino: ${ok} ok, ${erros} erros`);

  // Ajustar sequência do BIGSERIAL para o próximo id após o maior id inserido
  if (linhas.length) {
    const maxId = Math.max(...linhas.map(l => l.id));
    const { error: seqErr } = await destino.rpc("setval_feedback_registros", { novo_max: maxId }).single();
    if (seqErr && !seqErr.message.includes("Could not find the function")) {
      console.warn("  Aviso: ajuste de sequência falhou:", seqErr.message);
      console.warn(`  Rodar manualmente: SELECT setval(pg_get_serial_sequence('feedback_registros','id'), ${maxId});`);
    }
  }

  return { origem: data.length, ok, erros };
}

// -----------------------------------------------------------------------------
// clientes_info → feedback_clientes_info
// -----------------------------------------------------------------------------
async function migrarClientesInfo() {
  console.log("\n=== clientes_info → feedback_clientes_info ===");

  const { data, error } = await origem.from("clientes_info").select("*");
  if (error) throw new Error("origem.clientes_info: " + error.message);

  console.log(`  origem: ${data.length} registros`);

  const linhas = data.map((r) => {
    // cliente_key vinha no formato 'omie_<codigo>' ou 'nome_<NOME>'. Extrair
    // codigo_omie se houver, pra facilitar JOIN futuro com Clientes.
    let codigo_omie = null;
    if (typeof r.cliente_key === "string" && r.cliente_key.startsWith("omie_")) {
      codigo_omie = r.cliente_key.slice("omie_".length);
    }

    // funcionarios/fazendas podiam vir como string JSON ou array JSONB
    const parseJson = (v, fallback) => {
      if (!v) return fallback;
      if (Array.isArray(v) || typeof v === "object") return v;
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return fallback; }
      }
      return fallback;
    };

    return {
      cliente_key: r.cliente_key,
      codigo_omie,
      nome: r.nome || null,
      cidade: r.cidade,
      email: r.email,
      funcionarios: parseJson(r.funcionarios, []),
      fazendas: parseJson(r.fazendas, []),
      atualizado_em: r.atualizado_em || new Date().toISOString(),
    };
  });

  let ok = 0, erros = 0;
  for (const lote of chunk(linhas, LOTE)) {
    const { error: upErr } = await destino
      .from("feedback_clientes_info")
      .upsert(lote, { onConflict: "cliente_key" });
    if (upErr) {
      erros += lote.length;
      console.error("  ERRO no lote:", upErr.message);
    } else {
      ok += lote.length;
      process.stdout.write(`  upsert: ${ok}/${linhas.length}\r`);
    }
  }
  console.log(`\n  destino: ${ok} ok, ${erros} erros`);

  return { origem: data.length, ok, erros };
}

// -----------------------------------------------------------------------------
// Conferência final: contagens batem?
// -----------------------------------------------------------------------------
async function conferir() {
  console.log("\n=== Conferência ===");

  const [
    { count: origemCrm }, { count: origemRfm }, { count: origemInfo },
    { count: destCrm },   { count: destRfm },   { count: destInfo },
  ] = await Promise.all([
    origem.from("feedbacks").select("*", { count: "exact", head: true }).eq("tipo", "crm"),
    origem.from("feedbacks").select("*", { count: "exact", head: true }).eq("tipo", "rfm"),
    origem.from("clientes_info").select("*", { count: "exact", head: true }),
    destino.from("feedback_registros").select("*", { count: "exact", head: true }).eq("tipo", "crm"),
    destino.from("feedback_registros").select("*", { count: "exact", head: true }).eq("tipo", "rfm"),
    destino.from("feedback_clientes_info").select("*", { count: "exact", head: true }),
  ]);

  const linhas = [
    ["CRM",             origemCrm,  destCrm],
    ["RFM",             origemRfm,  destRfm],
    ["clientes_info",   origemInfo, destInfo],
  ];

  let tudoOk = true;
  console.log("");
  console.log("  Tabela          | origem  | destino | diff");
  console.log("  ----------------|---------|---------|------");
  for (const [nome, o, d] of linhas) {
    const diff = (o ?? 0) - (d ?? 0);
    const flag = diff === 0 ? "✓" : "✗";
    if (diff !== 0) tudoOk = false;
    console.log(`  ${nome.padEnd(15)} | ${String(o ?? 0).padStart(7)} | ${String(d ?? 0).padStart(7)} | ${String(diff).padStart(4)} ${flag}`);
  }
  console.log("");
  return tudoOk;
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------
(async () => {
  try {
    const t0 = Date.now();
    const fb = await migrarFeedbacks();
    const ci = await migrarClientesInfo();
    const ok = await conferir();

    console.log(`Tempo total: ${Math.round((Date.now() - t0) / 1000)}s`);
    if (ok) {
      console.log("✅ Migração concluída — contagens batem.");
      process.exit(0);
    } else {
      console.log("⚠️  Migração concluída com divergência. Investigar antes de pausar o Supabase antigo.");
      process.exit(2);
    }
  } catch (e) {
    console.error("❌ Falha:", e.message);
    process.exit(1);
  }
})();
