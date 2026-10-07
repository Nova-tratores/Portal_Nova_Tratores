// DIAGNÓSTICO (read-only, descartável) — divergência do popup "Serviços — decomposição"
// do /estoque/dashboard: Receita (os_mensal.valor_nota) MENOR que HR+KM+Outros (soma de
// itens de os_servicos_itens com os_nfse.tem_nota=true).
//
// NÃO escreve nada. Só SELECT no Supabase. Distingue:
//   Hipótese 1 (skew): valor_nota congelado defasado × os_nfse vivo (com dedup, itens ≫ valor_nota).
//   Hipótese 2 (duplicação): linhas repetidas em os_servicos_itens (rawSum ≈ 2× dedupSum ≈ valor_nota).
//
// Uso: node scripts/diag-servicos-decomp.mjs [mes] [ano]
import fs from 'node:fs';

const ENVPATH = 'c:/Users/hhenr/Projetos/Github/Appnovat/Portal_Nova_Tratores/.env.local';
const env = {};
for (const line of fs.readFileSync(ENVPATH, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const now = new Date();
const MES = Number(process.argv[2]) || (now.getMonth() + 1);
const ANO = Number(process.argv[3]) || now.getFullYear();

async function sbGet(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

// Lê TODAS as linhas (PostgREST corta em 1000) via limit/offset.
async function sbAll(path) {
  const rows = [];
  let offset = 0;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await sbGet(`${path}${sep}limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function diagConta(conta) {
  console.log(`\n══════════ CONTA ${conta} — ${String(MES).padStart(2, '0')}/${ANO} ══════════`);

  // 1) os_mensal (Caminho A — Receita)
  const mensal = await sbGet(`os_mensal?conta_omie=eq.${conta}&mes=eq.${MES}&ano=eq.${ANO}&select=*`);
  const M = mensal[0] || {};
  console.log('\n[os_mensal] (Caminho A — Receita congelada)');
  console.log('  valor_total          :', fmt(num(M.valor_total)));
  console.log('  valor_nota (RECEITA) :', M.valor_nota == null ? 'null' : fmt(num(M.valor_nota)));
  console.log('  valor_interno        :', M.valor_interno == null ? 'null' : fmt(num(M.valor_interno)));
  console.log('  valor_interno_retorno:', M.valor_interno_retorno == null ? 'null' : fmt(num(M.valor_interno_retorno)));
  console.log('  valor_interno_puro   :', M.valor_interno_puro == null ? 'null' : fmt(num(M.valor_interno_puro)));

  // 2) os_servicos_itens (Caminho B — fonte do HR/KM/Outros)
  const itens = await sbAll(`os_servicos_itens?conta_omie=eq.${conta}&mes=eq.${MES}&ano=eq.${ANO}&select=ncod_os,numero_os,descricao,tipo,qtde,valor_unit,valor_total,atualizado_em`);
  console.log('\n[os_servicos_itens] (Caminho B)');
  console.log('  linhas totais        :', itens.length);
  const osSet = new Set(itens.map((r) => r.ncod_os));
  console.log('  OS distintas (ncod_os):', osSet.size);
  if (itens.length) {
    const datas = itens.map((r) => String(r.atualizado_em || '')).sort();
    console.log('  atualizado_em (min→max):', datas[0], '→', datas[datas.length - 1]);
  }

  // Assinatura de linha p/ dedup: mesma OS + mesma descrição + mesmos números.
  const sig = (r) => `${r.ncod_os}|${r.descricao}|${num(r.qtde)}|${num(r.valor_unit)}|${num(r.valor_total)}|${r.tipo}`;
  const sigCount = new Map();
  for (const r of itens) sigCount.set(sig(r), (sigCount.get(sig(r)) || 0) + 1);
  const repetidas = [...sigCount.values()].filter((c) => c > 1);
  const totalRepetidoExtra = [...sigCount.entries()].reduce((s, [, c]) => s + (c - 1), 0);
  console.log('  assinaturas distintas:', sigCount.size);
  console.log('  assinaturas repetidas:', repetidas.length, `(linhas extras por repetição: ${totalRepetidoExtra})`);

  // 3) os_nfse (tem_nota) das OS deste mês
  const ids = [...osSet];
  const notaMap = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const nf = await sbGet(`os_nfse?conta_omie=eq.${conta}&ncod_os=in.(${chunk.join(',')})&select=ncod_os,tem_nota`);
    nf.forEach((r) => notaMap.set(num(r.ncod_os), !!r.tem_nota));
  }
  const osComNota = ids.filter((id) => notaMap.get(num(id)));
  console.log('\n[os_nfse] OS com tem_nota=true:', osComNota.length, 'de', ids.length);

  // 4) Reproduz obterTiposComNotaMes (raw) e a versão dedup (1 por assinatura).
  const acc = (rows) => {
    const t = { hr: 0, km: 0, outros: 0 };
    for (const r of rows) {
      if (r.tipo === 'HR') t.hr += num(r.valor_total);
      else if (r.tipo === 'KM') t.km += num(r.valor_total);
      else t.outros += num(r.valor_total);
    }
    return t;
  };
  const comNotaRows = itens.filter((r) => notaMap.get(num(r.ncod_os)));
  const seen = new Set();
  const comNotaDedup = comNotaRows.filter((r) => { const k = sig(r); if (seen.has(k)) return false; seen.add(k); return true; });

  const raw = acc(comNotaRows);
  const ded = acc(comNotaDedup);
  const rawTot = raw.hr + raw.km + raw.outros;
  const dedTot = ded.hr + ded.km + ded.outros;

  console.log('\n[HR/KM/Outros — itens COM NOTA]');
  console.log('  RAW  (como o card faz hoje):', 'HR', fmt(raw.hr), '| KM', fmt(raw.km), '| Outros', fmt(raw.outros), '| Σ', fmt(rawTot));
  console.log('  DEDUP (1 por assinatura)  :', 'HR', fmt(ded.hr), '| KM', fmt(ded.km), '| Outros', fmt(ded.outros), '| Σ', fmt(dedTot));

  // 5) Veredito
  const vn = M.valor_nota == null ? null : num(M.valor_nota);
  console.log('\n[COMPARAÇÃO]');
  console.log('  Receita (valor_nota)      :', vn == null ? 'null' : fmt(vn));
  console.log('  Σ itens com nota (RAW)    :', fmt(rawTot));
  console.log('  Σ itens com nota (DEDUP)  :', fmt(dedTot));
  if (vn != null && dedTot > 0) {
    console.log('  razão RAW/DEDUP           :', (rawTot / dedTot).toFixed(3), '(≈2.0 ⇒ duplicação)');
    console.log('  razão DEDUP/Receita       :', (dedTot / vn).toFixed(3), '(≈1.0 ⇒ bate; ≫1 ⇒ skew de snapshot)');
  }
  return { conta, rawTot, dedTot, vn, itens: itens.length, dupExtra: totalRepetidoExtra };
}

(async () => {
  console.log('Diagnóstico Serviços—Decomposição | mês/ano:', MES + '/' + ANO);
  const res = [];
  for (const c of ['NOVA', 'CASTRO']) {
    try { res.push(await diagConta(c)); }
    catch (e) { console.log(`\n[${c}] erro:`, e.message); }
  }
  const soma = res.reduce((a, r) => ({ rawTot: a.rawTot + r.rawTot, dedTot: a.dedTot + r.dedTot, vn: a.vn + (r.vn || 0) }), { rawTot: 0, dedTot: 0, vn: 0 });
  console.log('\n══════════ TODAS (NOVA+CASTRO) ══════════');
  console.log('  Receita Σ valor_nota      :', fmt(soma.vn));
  console.log('  Σ itens com nota (RAW)    :', fmt(soma.rawTot), '  ← compara com o print (HR 58k+KM 19,7k+Outros 3k ≈ 80,7k)');
  console.log('  Σ itens com nota (DEDUP)  :', fmt(soma.dedTot));
  console.log('\nLeitura do veredito:');
  console.log('  • RAW ≈ 2×DEDUP e DEDUP ≈ Receita  ⇒ HIPÓTESE 2 (duplicação em os_servicos_itens).');
  console.log('  • RAW ≈ DEDUP e DEDUP ≫ Receita    ⇒ HIPÓTESE 1 (valor_nota congelado defasado / skew).');
})();
