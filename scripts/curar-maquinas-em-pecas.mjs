// CURADORIA (read-only) — a partir do diagnóstico de máquinas cadastradas como Peça,
// monta a LISTA CURADA de candidatos a reclassificação de família na Omie, com a
// família-alvo SUGERIDA por palavra-chave e o codigo_familia resolvido (o código que
// os produtos-máquina ATUAIS daquela conta mais usam p/ aquele nome de família).
//
// NÃO escreve nada. Gera um JSON de plano em <scratchpad>/plano-familias.json e imprime
// a tabela. O apply (aplicar-familias-maquina.mjs) consome esse JSON depois de aprovado.
//
// Uso: node scripts/curar-maquinas-em-pecas.mjs [valorMin]   (default 8000)
import fs from 'node:fs';

const ENVPATH = 'c:/Users/hhenr/Projetos/Github/Appnovat/Portal_Nova_Tratores/.env.local';
const env = {};
for (const line of fs.readFileSync(ENVPATH, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); }
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const OUT = (env.TEMP || env.TMP || '.') ; // fallback

const VALOR_MIN = Number(process.argv[2]) || 8000;
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function classificarGrupo(familia) {
  const fam = norm(familia);
  if (!fam || fam === 'nd' || fam === 'n/d' || fam === '#n/d' || fam.includes('sem famil') || fam.includes('sem nome') || fam.includes('indefinid')) return 'ignorar';
  if (fam.includes('kit') && fam.includes('revis')) return 'ignorar';
  if (fam.includes('ativo') && fam.includes('imobiliz')) return 'ignorar';
  if (fam.includes('peca')) return 'peca';
  return 'maquina';
}
const KEYWORDS = /(TRATOR|COLHEITA|COLHEITADEIRA|KAPINA|GEOTERRIS|PLANTADEIRA|PULVERIZAD|RO[ÇC]ADEIRA|M[ÁA]QUINA|IMPLEMENTO|RETRO|P[ÁA] CARREGADEIRA|ENSILADEIRA|GRADE|ARADO|SUBSOLADOR|GUINCHO|EMPILHADEIRA|PLATAFORMA|TRINCHA|DESCOMPACT)/i;

// Descrição → nome de família-alvo (na ordem: mais específico primeiro).
function sugerirFamilia(desc) {
  const d = norm(desc);
  if (/plataforma/.test(d)) return 'Conjunto Frontal';
  if (/plantadeira|semeadeira|adubadeira/.test(d)) return 'Plantadeira/Semeadeira';
  if (/rocadeira|kapina|trincha/.test(d)) return d.includes('trincha') ? 'TRINCHA' : 'Roçadeira';
  if (/pulverizad/.test(d)) return 'Pulverizador';
  if (/descompact|subsolador|escarificador|terraceador/.test(d)) return 'Subsolador/Escarificador/Terraceador';
  if (/geoterris|piloto|smart|precis[aã]o|gps|antena/.test(d)) return 'Agricultura de Precisão';
  if (/grade|arado/.test(d)) return 'Grade';
  if (/trator/.test(d)) return d.includes('seminov') ? 'Trator Seminovo' : 'Trator Novo';
  return ''; // sem sugestão automática → revisar manualmente
}

async function sbGet(p) { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function sbAll(p) { const rows = []; let o = 0; for (;;) { const sep = p.includes('?') ? '&' : '?'; const pg = await sbGet(`${p}${sep}limit=1000&offset=${o}`); rows.push(...pg); if (pg.length < 1000) break; o += 1000; } return rows; }
function parseItemEntrada(it) { const prod = it && it.prod ? it.prod : null; if (prod) { const nf = (it.nfProdInt || {}); const nCod = nf.nCodProd != null ? String(nf.nCodProd) : ''; return { codigo: nCod && nCod !== '0' ? nCod : '', valor: num(prod.vProd ?? prod.vTotItem) }; } return { codigo: String(it.codigo_produto ?? ''), valor: num(it.valor_total) }; }

async function curarConta(conta) {
  const low = conta.toLowerCase();
  // Famílias: nome→[codigos]; e codigo mais usado por produtos-máquina p/ desempatar.
  const fams = await sbGet(`familias?conta_omie=eq.${low}&select=codigo_familia,nome&limit=1000`);
  const codesPorNome = new Map(); // norm(nome) -> Set(codigo)
  for (const f of fams) { const k = norm(f.nome); if (!codesPorNome.has(k)) codesPorNome.set(k, new Set()); codesPorNome.get(k).add(Number(f.codigo_familia)); }

  const prods = await sbAll(`produtos?conta_omie=eq.${low}&select=codigo_produto,codigo,descricao,familia_nome,codigo_familia,cmc,estoque,valor_estoque`);
  // Uso atual de codigo_familia por nome (só produtos NÃO-peça): p/ escolher o código certo.
  const usoPorNome = new Map(); // norm(nome) -> Map(codigo_familia -> count)
  for (const p of prods) {
    if (classificarGrupo(p.familia_nome) !== 'maquina') continue;
    const k = norm(p.familia_nome), cf = Number(p.codigo_familia);
    if (!cf) continue;
    if (!usoPorNome.has(k)) usoPorNome.set(k, new Map());
    const mm = usoPorNome.get(k); mm.set(cf, (mm.get(cf) || 0) + 1);
  }
  const resolverCodigo = (nome) => {
    const k = norm(nome);
    const uso = usoPorNome.get(k);
    if (uso && uso.size) return [...uso.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const set = codesPorNome.get(k);
    if (set && set.size) return [...set][0];
    return null;
  };

  const pecas = prods.filter((p) => classificarGrupo(p.familia_nome) === 'peca');
  const byCod = new Map(pecas.map((p) => [String(p.codigo_produto), p]));

  // Remessa + entrada + saída por cod (só peça).
  const movs = await sbAll(`movimentacao_produtos?conta_omie=eq.${low}&status=in.(Pendente,Devolvida)&select=cod_produto,data_saida,valor_unitario`);
  const remessa = new Map();
  for (const m of movs) { const c = String(m.cod_produto); if (!byCod.has(c)) continue; const e = remessa.get(c) || { datas: [], vMax: 0 }; if (m.data_saida) e.datas.push(String(m.data_saida)); e.vMax = Math.max(e.vMax, num(m.valor_unitario)); remessa.set(c, e); }

  const entrada = new Map();
  const notas = await sbAll(`notas_entrada?conta_omie=eq.${conta}&select=itens`);
  for (const n of notas) for (const it of (Array.isArray(n.itens) ? n.itens : [])) { const { codigo, valor } = parseItemEntrada(it); if (codigo && byCod.has(String(codigo))) entrada.set(String(codigo), (entrada.get(String(codigo)) || 0) + valor); }

  const saida = new Map();
  for (const ano of [2024, 2025, 2026]) { const v = await sbAll(`vendas_itens?conta_omie=eq.${conta}&ano=eq.${ano}&select=codigo_produto,valor_total`); for (const r of v) { const c = String(r.codigo_produto); if (byCod.has(c)) saida.set(c, (saida.get(c) || 0) + num(r.valor_total)); } }

  // Candidatos: peça com sinal e valor material.
  const cand = [];
  for (const p of pecas) {
    const cod = String(p.codigo_produto);
    const rem = remessa.get(cod), en = entrada.get(cod) || 0, sa = saida.get(cod) || 0;
    const cmc = num(p.cmc);
    const sinais = [];
    if (rem) sinais.push('REMESSA');
    if (cmc > 15000 || (rem && rem.vMax > 15000)) sinais.push('CMC-ALTO');
    if (KEYWORDS.test(String(p.descricao || ''))) sinais.push('PALAVRA');
    if (!sinais.length) continue;
    const valorRef = Math.max(cmc, en, sa, rem ? rem.vMax : 0);
    // materialidade: CMC alto OU remessa OU valor de entrada/saída acima do piso
    if (!(sinais.includes('CMC-ALTO') || rem || en >= VALOR_MIN || sa >= VALOR_MIN)) continue;
    const alvoNome = sugerirFamilia(p.descricao);
    const alvoCod = alvoNome ? resolverCodigo(alvoNome) : null;
    cand.push({ conta, codigo_produto: Number(cod), sku: p.codigo, descricao: p.descricao, familia_atual: p.familia_nome, cmc, estoque: num(p.estoque), entrada: en, saida: sa, remessa_datas: rem ? [...new Set(rem.datas)].sort() : [], sinais, alvo_nome: alvoNome, alvo_codigo_familia: alvoCod, valorRef });
  }
  cand.sort((a, b) => b.valorRef - a.valorRef);
  return cand;
}

(async () => {
  console.log(`CURADORIA máquinas-em-peças | valorMin=${fmt(VALOR_MIN)}\n`);
  const plano = [];
  for (const c of ['NOVA', 'CASTRO']) {
    const cand = await curarConta(c);
    console.log(`\n══════ ${c} — ${cand.length} candidatos ══════`);
    for (const x of cand) {
      const alvo = x.alvo_nome ? `${x.alvo_nome} (${x.alvo_codigo_familia ?? '??'})` : '‹REVISAR›';
      console.log(`• ${x.sku}  (id ${x.codigo_produto})  [${x.sinais.join('+')}]`);
      console.log(`    ${String(x.descricao || '').slice(0, 72)}`);
      console.log(`    cmc=${fmt(x.cmc)}  entrada=${fmt(x.entrada)}  saída=${fmt(x.saida)}${x.remessa_datas.length ? '  remessas: ' + x.remessa_datas.join(', ') : ''}`);
      console.log(`    Peças  →  ${alvo}`);
    }
    plano.push(...cand);
  }
  const semAlvo = plano.filter((x) => !x.alvo_codigo_familia);
  const path = `${OUT.replace(/\\/g, '/')}/plano-familias.json`;
  fs.writeFileSync(path, JSON.stringify(plano, null, 2));
  console.log(`\n──────── RESUMO ────────`);
  console.log(`  candidatos totais: ${plano.length}   (sem família-alvo automática: ${semAlvo.length})`);
  console.log(`  Σ entrada-peça afetada: ${fmt(plano.reduce((s, x) => s + x.entrada, 0))}`);
  console.log(`  Σ saída-peça afetada  : ${fmt(plano.reduce((s, x) => s + x.saida, 0))}`);
  console.log(`  plano salvo em: ${path}`);
  if (semAlvo.length) { console.log(`\n  ⚠ Sem sugestão automática (definir manualmente):`); for (const x of semAlvo) console.log(`     ${x.conta} ${x.sku} — ${String(x.descricao).slice(0, 60)}`); }
})();
