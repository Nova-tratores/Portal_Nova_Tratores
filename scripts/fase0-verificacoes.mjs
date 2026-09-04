// FASE 0 — fecha as verificações do Gate F0 que dependem do Supabase e dão pra
// fazer via PostgREST REST (service role key). NÃO grava nada, só lê.
//   0.1  volume de títulos em aberto (contas_pagar/contas_receber)
//   0.2  casing de conta_omie em produto_tipo
//   0.11 estado real da tabela cron_runs
// 0.3 (RLS/policies) NÃO entra aqui: precisa de pg_catalog (SQL editor / MCP).
//
// Uso: node scripts/fase0-verificacoes.mjs
import fs from 'node:fs';

const ENVPATH = 'c:/Users/hhenr/Projetos/Github/Appnovat/Portal_Nova_Tratores/.env.local';
const env = {};
for (const line of fs.readFileSync(ENVPATH, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SB || !KEY) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// count exato via HEAD + Content-Range (não baixa linhas)
async function count(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!r.ok && r.status !== 206 && r.status !== 200) throw new Error(`${path} → ${r.status}: ${await r.text()}`);
  const cr = r.headers.get('content-range') || '';
  const total = cr.split('/')[1];
  return total === '*' ? null : Number(total);
}

async function get(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// pagina uma coluna inteira (contorna teto de 1000 do PostgREST)
async function coluna(table, col, order = col) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB}/rest/v1/${table}?select=${col}&order=${order}`, {
      headers: { ...H, Range: `${from}-${from + 999}` },
    });
    if (!r.ok && r.status !== 206) throw new Error(`${table} → ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function tabelaExiste(t) {
  const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=0`, { headers: H });
  return r.ok;
}

const linha = () => console.log('─'.repeat(64));

async function main() {
  console.log(`Supabase: ${SB}`);
  console.log(`Rodado em: ${new Date().toISOString()}`);

  // ───────────────────────── 0.1 ─────────────────────────
  linha(); console.log('0.1 — Volume de títulos em aberto');
  for (const t of ['contas_pagar', 'contas_receber']) {
    if (!(await tabelaExiste(t))) { console.log(`  ${t}: (tabela não encontrada via REST)`); continue; }
    const total = await count(t);
    // "em aberto" = sem data de pagamento (proxy robusto, independe do rótulo Omie)
    const semPagto = await count(`${t}?data_pagamento=is.null`);
    // quebra pela coluna real status_titulo (Omie)
    const statuses = await coluna(t, 'status_titulo');
    const porStatus = {};
    for (const r of statuses) porStatus[r.status_titulo ?? '(null)'] = (porStatus[r.status_titulo ?? '(null)'] || 0) + 1;
    console.log(`  ${t}: total=${total} | sem data_pagamento=${semPagto}`);
    console.log(`    por status_titulo: ${Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    if (semPagto != null && semPagto > 1000) console.log(`    ⚠️  > 1.000 em aberto → Patrimônio truncado hoje → 2.3 sobe pra Fase 1`);
  }

  // ───────────────────────── 0.2 ─────────────────────────
  linha(); console.log('0.2 — Casing de conta_omie em produto_tipo');
  if (!(await tabelaExiste('produto_tipo'))) {
    console.log('  (tabela produto_tipo não encontrada via REST)');
  } else {
    const rows = await coluna('produto_tipo', 'conta_omie');
    const grupos = {};
    for (const r of rows) grupos[r.conta_omie ?? '(null)'] = (grupos[r.conta_omie ?? '(null)'] || 0) + 1;
    for (const [k, v] of Object.entries(grupos).sort((a, b) => b[1] - a[1])) console.log(`  ${JSON.stringify(k)}: ${v}`);
    const minusculas = Object.keys(grupos).filter((k) => k !== '(null)' && k === k.toLowerCase() && k !== k.toUpperCase());
    if (minusculas.length) console.log(`  ⚠️  casing minúsculo presente (${minusculas.join(', ')}) → itens sumindo em ABC/Giro/Sugestão → tarefa 1.9`);
    else console.log('  ✅ sem casing minúsculo divergente');
  }

  // ───────────────────────── 0.11 ─────────────────────────
  linha(); console.log('0.11 — Estado real de cron_runs');
  if (!(await tabelaExiste('cron_runs'))) {
    console.log('  ❌ tabela cron_runs NÃO encontrada via REST → migration sql/cron-runs.sql NÃO aplicada (ou fora do schema public)');
  } else {
    const total = await count('cron_runs');
    const abertos = await count('cron_runs?finalizado_em=is.null');
    const ultimo = await get('cron_runs?select=iniciado_em&order=iniciado_em.desc&limit=1');
    const jobs = await coluna('cron_runs', 'job');
    const setJobs = [...new Set(jobs.map((r) => r.job))].sort();
    console.log(`  total=${total} | abertos(finalizado_em is null)=${abertos} | ultimo=${ultimo[0]?.iniciado_em ?? '(nenhum)'}`);
    console.log(`  jobs distintos (${setJobs.length}): ${setJobs.join(', ') || '(nenhum)'}`);
    if (abertos > 0) console.log(`  ⚠️  ${abertos} run(s) sem finalizado_em → possível lixo de crash (status='rodando' órfão) → tarefa 1.1`);
  }
  linha();
  console.log('0.3 (RLS/policies) NÃO cabe no REST — rodar no SQL editor do Supabase.');
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
