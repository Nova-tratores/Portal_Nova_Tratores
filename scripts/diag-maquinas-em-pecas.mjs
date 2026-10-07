// DIAGNÓSTICO (read-only, descartável) — MÁQUINAS contaminando as PEÇAS no Cruzamento
// por Família. A classificação peça×máquina tem fonte ÚNICA: produtos.familia_nome
// (espelho da Omie). Uma máquina cai nas Peças quando o SKU está cadastrado com família
// contendo "peça" — então aparece na tabela, no gráfico e no bucket "Remessa" da
// Reconciliação (razão). Este script LISTA todos os SKUs peça que na verdade são máquina,
// combinando 3 sinais (remessa/demonstração + CMC alto + palavra-chave na descrição) e
// QUANTIFICA o impacto em R$ na entrada/saída de Peças.
//
// NÃO escreve nada. Só SELECT no Supabase (produtos, movimentacao_produtos, vendas_itens,
// notas_entrada, estoque_movimentos).
//
// Uso: node scripts/diag-maquinas-em-pecas.mjs [cmcMin]   (default cmcMin = 15000)
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

const CMC_MIN = Number(process.argv[2]) || 15000;
const KEYWORDS = /(TRATOR|COLHEITA|COLHEITADEIRA|KAPINA|GEOTERRIS|PLANTADEIRA|PULVERIZAD|RO[ÇC]ADEIRA|M[ÁA]QUINA|IMPLEMENTO|RETRO|P[ÁA] CARREGADEIRA|ENSILADEIRA|GRADE|ARADO|SUBSOLADOR|GUINCHO|EMPILHADEIRA)/i;

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Replica classificarGrupo de src/lib/estoque/cruzamento-familia.ts
const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function classificarGrupo(familia) {
  const fam = norm(familia);
  if (!fam || fam === 'nd' || fam === 'n/d' || fam === '#n/d' || fam.includes('sem famil') || fam.includes('sem nome') || fam.includes('indefinid')) return 'ignorar';
  if (fam.includes('kit') && fam.includes('revis')) return 'ignorar';
  if (fam.includes('ativo') && fam.includes('imobiliz')) return 'ignorar';
  if (fam.includes('peca')) return 'peca';
  return 'maquina';
}

async function sbGet(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return r.json();
}
// Lê TODAS as linhas (PostgREST corta em 1000) via limit/offset.
async function sbAll(path) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await sbGet(`${path}${sep}limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

// parseItemEntrada (simplificado) de cruzamento-familia.ts: id interno + valor do item.
function parseItemEntrada(it) {
  const prod = it && it.prod ? it.prod : null;
  if (prod) {
    const nf = (it.nfProdInt || {});
    const nCod = nf.nCodProd != null ? String(nf.nCodProd) : '';
    return { codigo: nCod && nCod !== '0' ? nCod : '', qtd: num(prod.qCom), valor: num(prod.vProd ?? prod.vTotItem) };
  }
  return { codigo: String(it.codigo_produto ?? ''), qtd: num(it.quantidade), valor: num(it.valor_total) };
}

async function diagConta(conta) {
  const low = conta.toLowerCase();
  console.log(`\n══════════════════ CONTA ${conta} ══════════════════`);

  // 1) Universo PEÇA (produtos com família "peça")
  const prods = await sbAll(`produtos?conta_omie=eq.${low}&select=codigo_produto,codigo,descricao,familia_nome,cmc,estoque,valor_estoque`);
  const pecas = prods.filter((p) => classificarGrupo(p.familia_nome) === 'peca');
  console.log(`Produtos peça: ${pecas.length} de ${prods.length}`);
  const byCod = new Map(pecas.map((p) => [String(p.codigo_produto), p]));

  // 2a) Sinal REMESSA — movimentacao_produtos (demonstração) dos cod_produto peça
  const movs = await sbAll(`movimentacao_produtos?conta_omie=eq.${low}&status=in.(Pendente,Devolvida)&select=cod_produto,status,data_saida,data_entrada,valor_unitario,qtde`);
  const remessaPorCod = new Map(); // cod -> {datas:[], valorMax}
  for (const m of movs) {
    const cod = String(m.cod_produto);
    if (!byCod.has(cod)) continue; // só interessa peça
    const e = remessaPorCod.get(cod) || { datas: [], valorMax: 0 };
    if (m.data_saida) e.datas.push(String(m.data_saida));
    e.valorMax = Math.max(e.valorMax, num(m.valor_unitario));
    remessaPorCod.set(cod, e);
  }

  // 2b/2c) Montar suspeitos: remessa OU cmc alto OU palavra-chave
  const suspeitos = [];
  for (const p of pecas) {
    const cod = String(p.codigo_produto);
    const rem = remessaPorCod.get(cod);
    const sinais = [];
    if (rem) sinais.push('REMESSA');
    if (num(p.cmc) > CMC_MIN || (rem && rem.valorMax > CMC_MIN)) sinais.push('CMC-ALTO');
    if (KEYWORDS.test(String(p.descricao || ''))) sinais.push('PALAVRA');
    if (sinais.length) suspeitos.push({ ...p, cod, sinais, remDatas: rem ? rem.datas : [] });
  }
  console.log(`SKUs peça SUSPEITOS (máquina disfarçada): ${suspeitos.length}\n`);
  if (!suspeitos.length) return { conta, suspeitos: [], impacto: {} };

  const codsSusp = new Set(suspeitos.map((s) => s.cod));

  // 3a) Impacto SAÍDA — vendas_itens (todos os anos/meses) dos suspeitos
  const saidaPorCod = new Map();
  for (const s of suspeitos.length ? [suspeitos] : []) void s; // noop
  // vendas_itens pode ser grande; puxa por ano recente relevante (2024..2026)
  for (const ano of [2024, 2025, 2026]) {
    const vend = await sbAll(`vendas_itens?conta_omie=eq.${conta}&ano=eq.${ano}&select=codigo_produto,mes,ano,valor_total,quantidade`);
    for (const v of vend) {
      const cod = String(v.codigo_produto);
      if (!codsSusp.has(cod)) continue;
      const e = saidaPorCod.get(cod) || { valor: 0, meses: new Set() };
      e.valor += num(v.valor_total);
      e.meses.add(`${String(v.mes).padStart(2, '0')}/${v.ano}`);
      saidaPorCod.set(cod, e);
    }
  }

  // 3b) Impacto ENTRADA — notas_entrada (itens) casados por nCodProd
  const entradaPorCod = new Map();
  const notas = await sbAll(`notas_entrada?conta_omie=eq.${conta}&select=itens`);
  for (const nota of notas) {
    const itens = Array.isArray(nota.itens) ? nota.itens : [];
    for (const it of itens) {
      const { codigo, valor } = parseItemEntrada(it);
      if (!codigo || !codsSusp.has(String(codigo))) continue;
      entradaPorCod.set(String(codigo), (entradaPorCod.get(String(codigo)) || 0) + valor);
    }
  }

  // 3c) Impacto RAZÃO — estoque_movimentos grupo=peca, por bucket, dos suspeitos
  const razaoPorCod = new Map(); // cod -> {bucket: efeito}
  const razaoBucketTotal = {};   // bucket -> efeito (suspeitos)
  const rz = await sbAll(`estoque_movimentos?conta_omie=eq.${low}&grupo=eq.peca&cancelado=eq.false&select=codigo_produto,bucket,efeito`);
  let razaoTotalPecaTodos = 0;
  const razaoBucketTodos = {};
  for (const r of rz) {
    const cod = String(r.codigo_produto);
    razaoTotalPecaTodos += num(r.efeito);
    razaoBucketTodos[r.bucket] = (razaoBucketTodos[r.bucket] || 0) + num(r.efeito);
    if (!codsSusp.has(cod)) continue;
    const e = razaoPorCod.get(cod) || {};
    e[r.bucket] = (e[r.bucket] || 0) + num(r.efeito);
    razaoPorCod.set(cod, e);
    razaoBucketTotal[r.bucket] = (razaoBucketTotal[r.bucket] || 0) + num(r.efeito);
  }

  // 4) Ordenar por impacto (|saída| + |entrada| + |efeito razão|) e imprimir
  const score = (s) => {
    const sa = saidaPorCod.get(s.cod)?.valor || 0;
    const en = entradaPorCod.get(s.cod) || 0;
    const rzTot = Object.values(razaoPorCod.get(s.cod) || {}).reduce((a, b) => a + b, 0);
    return Math.abs(sa) + Math.abs(en) + Math.abs(rzTot);
  };
  suspeitos.sort((a, b) => score(b) - score(a));

  let totSaida = 0, totEntrada = 0;
  for (const s of suspeitos) {
    const sa = saidaPorCod.get(s.cod);
    const en = entradaPorCod.get(s.cod) || 0;
    const rzc = razaoPorCod.get(s.cod) || {};
    totSaida += sa?.valor || 0;
    totEntrada += en;
    const rzStr = Object.entries(rzc).map(([b, v]) => `${b}=${fmt(v)}`).join(' ');
    console.log(`• SKU ${s.codigo}  (id ${s.cod})  [${s.sinais.join('+')}]  fam="${s.familia_nome}"`);
    console.log(`    ${String(s.descricao || '').slice(0, 70)}`);
    console.log(`    cmc=${fmt(num(s.cmc))}  estoque=${num(s.estoque)}  valor_estoque=${fmt(num(s.valor_estoque))}`);
    if (s.remDatas.length) console.log(`    remessas: ${[...new Set(s.remDatas)].sort().join(', ')}`);
    console.log(`    saída-peça(vendas)=${fmt(sa?.valor || 0)}${sa ? ` [${[...sa.meses].sort().join(', ')}]` : ''}   entrada-peça(NF)=${fmt(en)}`);
    if (rzStr) console.log(`    razão(peça) por bucket: ${rzStr}`);
    console.log('');
  }

  console.log(`──── TOTAIS ${conta} ────`);
  console.log(`  SKUs suspeitos: ${suspeitos.length}`);
  console.log(`  Σ saída-peça (vendas_itens) que é máquina  : ${fmt(totSaida)}`);
  console.log(`  Σ entrada-peça (notas_entrada) que é máquina: ${fmt(totEntrada)}`);
  console.log(`  Razão(peça) — efeito por bucket dos SUSPEITOS:`);
  Object.entries(razaoBucketTotal).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .forEach(([b, v]) => console.log(`      ${b.padEnd(16)} ${fmt(v)}    (de ${fmt(razaoBucketTodos[b] || 0)} do bucket todo → ${razaoBucketTodos[b] ? ((v / razaoBucketTodos[b]) * 100).toFixed(1) : '—'}%)`));
  console.log(`  Razão(peça) total (todos os produtos)       : ${fmt(razaoTotalPecaTodos)}`);

  return { conta, suspeitos, totSaida, totEntrada, razaoBucketTotal, razaoBucketTodos };
}

(async () => {
  console.log(`Diagnóstico: máquinas em Peças | cmcMin=${fmt(CMC_MIN)}`);
  const res = [];
  for (const c of ['NOVA', 'CASTRO']) {
    try { res.push(await diagConta(c)); }
    catch (e) { console.log(`\n[${c}] erro:`, e.message); }
  }
  console.log('\n══════════════════ RESUMO GERAL ══════════════════');
  let n = 0, sa = 0, en = 0;
  for (const r of res) { n += r.suspeitos?.length || 0; sa += r.totSaida || 0; en += r.totEntrada || 0; }
  console.log(`  SKUs peça que são máquina (NOVA+CASTRO): ${n}`);
  console.log(`  Σ saída-peça contaminada  : ${fmt(sa)}`);
  console.log(`  Σ entrada-peça contaminada: ${fmt(en)}`);
  console.log('\n  → São SKUs a ter a FAMÍLIA corrigida na Omie (de "Peças" p/ família de máquina).');
})();
