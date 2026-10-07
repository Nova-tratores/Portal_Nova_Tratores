// FINALIZA o plano de reclassificação (read-only) — aplica as DECISÕES do usuário sobre
// os candidatos, resolve o codigo_familia-alvo por conta (código mais usado pelos produtos-
// máquina atuais) e emite: (1) JSON final e (2) tabela markdown para revisão. NÃO escreve
// na Omie nem no Supabase.
//
// Uso: node scripts/finalizar-plano-familias.mjs
import fs from 'node:fs';

const ENVPATH = 'c:/Users/hhenr/Projetos/Github/Appnovat/Portal_Nova_Tratores/.env.local';
const OUTDIR = 'C:/Users/hhenr/AppData/Local/Temp/claude/c--Users-hhenr-Projetos-Github-Appnovat-Portal-Nova-Tratores/9637b361-47c3-4fd9-8bd1-b011299d2295/scratchpad';
const env = {};
for (const line of fs.readFileSync(ENVPATH, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); }
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function classificarGrupo(f) { const fam = norm(f); if (!fam || fam.includes('sem famil') || fam === 'nd' || fam === '#n/d') return 'ignorar'; if (fam.includes('kit') && fam.includes('revis')) return 'ignorar'; if (fam.includes('ativo') && fam.includes('imobiliz')) return 'ignorar'; if (fam.includes('peca')) return 'peca'; return 'maquina'; }
async function sbGet(p) { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function sbAll(p) { const rows = []; let o = 0; for (;;) { const sep = p.includes('?') ? '&' : '?'; const pg = await sbGet(`${p}${sep}limit=1000&offset=${o}`); rows.push(...pg); if (pg.length < 1000) break; o += 1000; } return rows; }

// DECISÕES do usuário — codigo_produto → família-alvo (nome) ou 'MANTER'.
const DECISOES = {
  // Grupo A — máquinas/implementos claros
  2181444932: 'Implemento Novo',        // PLATAFORMA CASE 3020
  2449384085: 'Implemento Novo',        // PLATAFORMA MAGNA
  2404287632: 'Plantadeira/Semeadeira', // PLANTADEIRA ADUBADEIRA PST DUO FLEX
  2258400181: 'Roçadeira',              // KAPINA COFFE 2300
  2479674535: 'Trator Seminovo',        // TRATOR NEW HOLLAND TL75E
  2484698754: 'Trator Seminovo',        // TRATOR MAHINDRA M.8000S
  2485620535: 'Agricultura de Precisão',// GEOTERRIS / KIT PILOTO SMART7
  2354010196: 'TRINCHA',                // TRINCHA LEVE TRL 140H
  2218528523: 'Subsolador/Escarificador/Terraceador', // DESCOMPACTADOR ADVANCED
  2084978258: 'Grade',                  // GRADE ARADORA INTERMEDIÁRIA
  2112945370: 'Roçadeira',              // ROÇADEIRA KD 132
  5602952422: 'Pulverizador',           // PULVERIZADOR ATM 250 (CASTRO)
  // Grupo B — implementos (destino sugerido, ajustável)
  2116582665: 'Implemento Novo',        // RACHADOR DE LENHA A TRATOR
  2456155094: 'Implemento Novo',        // GUINCHO P/ BIG BAG
  2145893435: 'Implemento Novo',        // KIT PÁ CARREGADEIRA L15
  2124772388: 'Implemento Novo',        // MOTO BOMBA P/ ABASTECIMENTO
  // Grupo C — decisões explícitas do usuário
  2427127712: 'Agricultura de Precisão',// Painel GTF-400  → reclassifica
  2047428289: 'MANTER',                 // KIT MANUTENÇÃO → peça
  2054607651: 'MANTER',                 // COMANDO HIDRÁULICO DO TRATOR → peça
  2408440019: 'MANTER',                 // ACIONADOR TRUCOUNT DA PLANTADORA → peça
  2144203652: 'MANTER',                 // BOMBA → peça (componente)
};

async function resolverPorConta(conta) {
  const low = conta.toLowerCase();
  const fams = await sbGet(`familias?conta_omie=eq.${low}&select=codigo_familia,nome&limit=1000`);
  const codesPorNome = new Map();
  for (const f of fams) { const k = norm(f.nome); if (!codesPorNome.has(k)) codesPorNome.set(k, new Set()); codesPorNome.get(k).add(Number(f.codigo_familia)); }
  const prods = await sbAll(`produtos?conta_omie=eq.${low}&select=familia_nome,codigo_familia`);
  const uso = new Map();
  for (const p of prods) { if (classificarGrupo(p.familia_nome) !== 'maquina') continue; const k = norm(p.familia_nome), cf = Number(p.codigo_familia); if (!cf) continue; if (!uso.has(k)) uso.set(k, new Map()); const mm = uso.get(k); mm.set(cf, (mm.get(cf) || 0) + 1); }
  return (nome) => { const k = norm(nome); const u = uso.get(k); if (u && u.size) return [...u.entries()].sort((a, b) => b[1] - a[1])[0][0]; const s = codesPorNome.get(k); return s && s.size ? [...s][0] : null; };
}

(async () => {
  const plano = JSON.parse(fs.readFileSync('C:/Users/hhenr/Projetos/Github/Appnovat/Portal_Nova_Tratores/plano-familias.json', 'utf8'));
  const resolver = { NOVA: await resolverPorConta('NOVA'), CASTRO: await resolverPorConta('CASTRO') };
  const byId = new Map(plano.map((p) => [Number(p.codigo_produto), p]));

  const final = [];
  for (const [idStr, destino] of Object.entries(DECISOES)) {
    const id = Number(idStr);
    const p = byId.get(id);
    if (!p) { console.warn(`⚠ codigo_produto ${id} não está no plano-familias.json`); continue; }
    const manter = destino === 'MANTER';
    const cf = manter ? null : resolver[p.conta](destino);
    final.push({ conta: p.conta, codigo_produto: id, sku: p.sku, descricao: p.descricao, familia_atual: p.familia_atual, acao: manter ? 'MANTER-PECA' : 'RECLASSIFICAR', alvo_nome: manter ? '' : destino, alvo_codigo_familia: cf, entrada: p.entrada, saida: p.saida, cmc: p.cmc, remessa_datas: p.remessa_datas });
  }
  // ordena: reclassificar por entrada desc, depois manter
  final.sort((a, b) => (a.acao === b.acao ? b.entrada - a.entrada : a.acao === 'RECLASSIFICAR' ? -1 : 1));

  const jsonPath = `${OUTDIR}/plano-familias-final.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(final, null, 2));

  // Markdown de revisão
  let md = `# Plano de reclassificação de família (revisão)\n\n`;
  md += `> Ajuste a coluna **Ação** ou **Família-alvo** onde quiser e me devolva. Nada foi escrito na Omie ainda.\n\n`;
  md += `| # | Conta | SKU | Descrição | Ação | Família-alvo (código) | Entrada | CMC |\n|--:|--|--|--|--|--|--:|--:|\n`;
  final.forEach((x, i) => {
    const alvo = x.acao === 'RECLASSIFICAR' ? `${x.alvo_nome} (${x.alvo_codigo_familia ?? '❌'})` : '—';
    md += `| ${i + 1} | ${x.conta} | \`${x.sku}\` | ${String(x.descricao).slice(0, 48).replace(/\|/g, '/')} | ${x.acao === 'RECLASSIFICAR' ? '↪ reclassificar' : '● manter peça'} | ${alvo} | ${fmt(x.entrada)} | ${fmt(x.cmc)} |\n`;
  });
  const recl = final.filter((x) => x.acao === 'RECLASSIFICAR');
  md += `\n**${recl.length}** a reclassificar · **${final.length - recl.length}** mantidas como peça · Σ entrada limpa: **${fmt(recl.reduce((s, x) => s + x.entrada, 0))}**\n`;
  const semCod = recl.filter((x) => !x.alvo_codigo_familia);
  if (semCod.length) md += `\n⚠️ Sem código de família resolvido: ${semCod.map((x) => x.sku).join(', ')}\n`;
  const mdPath = `${OUTDIR}/plano-familias-revisao.md`;
  fs.writeFileSync(mdPath, md);

  console.log(md);
  console.log(`\nJSON final : ${jsonPath}`);
  console.log(`Markdown   : ${mdPath}`);
})();
