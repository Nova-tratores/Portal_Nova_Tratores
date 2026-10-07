// PROVA (descartável) — o razão de estoque da Omie (MovimentoEstoque) FECHA o valor
// do estoque de cada produto: valor_fim − valor_ini = Σentradas − Σsaídas + Σrevalorização.
// Não grava nada. Só lê Supabase (escolher produtos) + Omie NOVA (movimentos de jul/2026).
//
// Uso: node scripts/prova-razao-estoque.mjs
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
const APPKEY = env.OMIE_APP_KEY_NOVA, APPSECRET = env.OMIE_APP_SECRET_NOVA;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function sbGet(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function omie(endpoint, call, param) {
  const body = JSON.stringify({ call, app_key: APPKEY, app_secret: APPSECRET, param: [param] });
  const r = await fetch(`https://app.omie.com.br/api/v1${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
  const data = await r.json();
  if (data && data.faultstring) throw new Error(`omie: ${data.faultstring}`);
  return data;
}

// Replica parseMovPeriodo de src/lib/ajustes/omie.ts
function parseMovPeriodo(arr) {
  const out = { cmcAnterior: 0, qtdeAnterior: 0, entradaCMC: 0, qtdeEntrada: 0, saidaCMC: 0, qtdeSaida: 0, cmcAtual: 0, qtdeAtual: 0 };
  if (!Array.isArray(arr)) return out;
  for (const e of arr) {
    const t = String((e && e.tipo) || '').toLowerCase();
    const cmcU = num(e && e.cmcUnitario), q = num(e && e.qtde);
    if (t.includes('anterior')) { out.cmcAnterior = cmcU; out.qtdeAnterior = q; }
    else if (t.includes('entrada')) { out.entradaCMC = cmcU; out.qtdeEntrada = q; }
    else if (t.includes('sa') && (t.includes('da') || t.includes('ída') || t.includes('ida'))) { out.saidaCMC = cmcU; out.qtdeSaida = q; }
    else if (t.includes('atual')) { out.cmcAtual = cmcU; out.qtdeAtual = q; }
  }
  return out;
}

async function movimentos(idProd, de, ate) {
  const d = await omie('/estoque/consulta/', 'MovimentoEstoque', {
    id_prod: Number(idProd), dataInicial: de, dataFinal: ate,
  });
  const lista = d.movProduto || d.movimentos || d.movEstoque || d.lista || [];
  const movs = [];
  for (const m of lista) {
    const mp = parseMovPeriodo(m && m.movPeriodo);
    movs.push({
      data: (m && (m.dtMov || m.data)) || null,
      codOrigem: String((m && (m.codOrigem || m.cCodOrigem)) || '').toUpperCase(),
      desOrigem: (m && (m.desOrigem || m.cDesOrigem || m.descricao)) || '',
      cancelado: (m && m.cancelamento === 'S') || false,
      ...mp,
    });
  }
  return movs;
}

function ord(d) { // "DD/MM/YYYY" -> comparável
  const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? +`${m[3]}${m[2]}${m[1]}` : 0;
}

const MES = 7, ANO = 2026, DE = '01/07/2026', ATE = '31/07/2026';

async function main() {
  console.log(`\n=== PROVA razão de estoque — Omie NOVA — ${DE}..${ATE} ===\n`);
  // 1) produtos de peça (conta nova) que tiveram VENDA em jul/2026 (garante movimento)
  const vend = await sbGet(`vendas_itens?select=codigo_produto&ano=eq.${ANO}&mes=eq.${MES}&limit=1000`);
  const codsVenda = [...new Set(vend.map((v) => String(v.codigo_produto)).filter(Boolean))];
  // produtos nova com família de peça e algum valor
  const prods = await sbGet(`produtos?select=codigo_produto,codigo,familia_nome,estoque,valor_estoque,cmc&conta_omie=eq.nova&limit=5000`);
  const byCod = new Map(prods.map((p) => [String(p.codigo_produto), p]));
  const alvo = codsVenda
    .map((c) => byCod.get(c))
    .filter((p) => p && /pe[çc]a/i.test(String(p.familia_nome || '')) && num(p.estoque) > 0)
    .slice(0, 10);
  console.log(`Produtos-peça (nova) com venda em jul/26 e estoque>0: usando ${alvo.length}\n`);

  const origens = new Map(); // codOrigem -> {des, efeito}
  const globalPorOrigem = new Map();
  let okAll = true;
  for (const p of alvo) {
    const movs0 = await movimentos(p.codigo_produto, DE, ATE);
    const movs = movs0.filter((m) => !m.cancelado).sort((a, b) => ord(a.data) - ord(b.data));
    if (movs.length === 0) { console.log(`SKU ${p.codigo} (${p.codigo_produto}): sem movimento no período\n`); continue; }
    const first = movs[0], last = movs[movs.length - 1];
    const valIni = first.qtdeAnterior * first.cmcAnterior;
    const valFim = last.qtdeAtual * last.cmcAtual;
    // Efeito REAL de cada movimento no valor do estoque, bucketizado por codOrigem.
    const porOrigem = new Map();
    for (const m of movs) {
      const efeito = m.qtdeAtual * m.cmcAtual - m.qtdeAnterior * m.cmcAnterior;
      porOrigem.set(m.codOrigem, (porOrigem.get(m.codOrigem) || 0) + efeito);
      origens.set(m.codOrigem, m.desOrigem);
      globalPorOrigem.set(m.codOrigem, (globalPorOrigem.get(m.codOrigem) || 0) + efeito);
    }
    const recomposto = [...porOrigem.values()].reduce((a, b) => a + b, 0);
    const deltaReal = valFim - valIni;
    const dif = deltaReal - recomposto;
    const ok = Math.abs(dif) < 0.5;
    okAll = okAll && ok;
    const brk = [...porOrigem.entries()].map(([o, v]) => `${o}=${fmt(v)}`).join('  ');
    console.log(`SKU ${p.codigo}  (id ${p.codigo_produto})  — ${movs.length} mov`);
    console.log(`   valor_ini=${fmt(valIni)}  valor_fim=${fmt(valFim)}  Δreal=${fmt(deltaReal)}`);
    console.log(`   efeito por origem: ${brk}  → soma=${fmt(recomposto)}`);
    console.log(`   ${ok ? '✅ FECHA' : '❌ DIFERE'} (dif=${fmt(dif)})   [produtos.valor_estoque atual=${fmt(num(p.valor_estoque))}]\n`);
  }
  console.log(`=== ${okAll ? '✅ TODOS FECHARAM (soma dos efeitos por origem = Δvalor)' : '❌ ALGUM NÃO FECHOU'} ===`);
  console.log(`\nEfeito TOTAL por codOrigem (semente dos buckets da Reconciliação):`);
  [...globalPorOrigem.entries()].sort((a, b) => b[1] - a[1]).forEach(([o, v]) => console.log(`  ${o.padEnd(5)} ${(origens.get(o) || '').padEnd(34)} ${fmt(v)}`));
}
main().catch((e) => { console.error('ERRO:', e); process.exit(1); });
