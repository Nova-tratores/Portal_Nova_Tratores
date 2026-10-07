// APPLY — reclassifica a FAMÍLIA na Omie dos SKUs máquina cadastrados como Peça.
// Consome o plano-familias-final.json (só linhas acao='RECLASSIFICAR'). Para cada SKU:
//   1) AlterarProduto na Omie (fonte da verdade)  — body 100% ASCII (igual a ajustes/omie.ts)
//   2) espelho otimista no Supabase: produtos {codigo_familia,familia_nome} + produto_tipo.familia
//   3) audit_log (best-effort)
//   4) razão: estoque_movimentos {grupo='maquina', familia=alvo} p/ sair do grupo Peça na Reconciliação
//
// SEGURANÇA: por padrão roda em DRY-RUN (não escreve). Para aplicar de verdade:
//   node scripts/aplicar-familias-maquina.mjs --apply
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ENVPATH = 'c:/Users/hhenr/Projetos/Github/Appnovat/Portal_Nova_Tratores/.env.local';
const PLANO = 'C:/Users/hhenr/AppData/Local/Temp/claude/c--Users-hhenr-Projetos-Github-Appnovat-Portal-Nova-Tratores/9637b361-47c3-4fd9-8bd1-b011299d2295/scratchpad/plano-familias-final.json';
const env = {};
for (const line of fs.readFileSync(ENVPATH, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); }
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const CRED = {
  NOVA: { k: env.OMIE_APP_KEY_NOVA || env.OMIE_APP_KEY, s: env.OMIE_APP_SECRET_NOVA || env.OMIE_APP_SECRET },
  CASTRO: { k: env.OMIE_APP_KEY_CASTRO, s: env.OMIE_APP_SECRET_CASTRO },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function omieAlterarFamilia(conta, codigoProduto, codigoFamilia) {
  const { k, s } = CRED[conta];
  if (!k || !s) throw new Error(`credenciais Omie ausentes p/ ${conta}`);
  const bodyAscii = JSON.stringify({ call: 'AlterarProduto', app_key: k, app_secret: s, param: [{ codigo_produto: Number(codigoProduto), codigo_familia: Number(codigoFamilia) }] })
    .replace(/[\u0080-\uffff]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  const r = await fetch('https://app.omie.com.br/api/v1/geral/produtos/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyAscii });
  const data = await r.json();
  if (data && data.faultstring) throw new Error(`omie: ${data.faultstring}`);
  if (data && data.status === 'error') throw new Error(`omie: ${data.message}`);
  return data;
}
async function sbPatch(table, filter, body) {
  const r = await fetch(`${SB}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`patch ${table} ${r.status}: ${await r.text()}`);
}
async function sbInsert(table, body) {
  const r = await fetch(`${SB}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`insert ${table} ${r.status}: ${await r.text()}`);
}

(async () => {
  const plano = JSON.parse(fs.readFileSync(PLANO, 'utf8'));
  const alvos = plano.filter((x) => x.acao === 'RECLASSIFICAR' && x.alvo_codigo_familia);
  console.log(`${APPLY ? '🟢 APPLY' : '🟡 DRY-RUN (use --apply p/ gravar)'} — ${alvos.length} SKUs a reclassificar\n`);

  let ok = 0, fail = 0;
  for (const x of alvos) {
    const low = x.conta.toLowerCase();
    const tag = `${x.conta} ${x.sku} (${x.codigo_produto}) → ${x.alvo_nome} (${x.alvo_codigo_familia})`;
    try {
      if (!APPLY) { console.log(`  [dry] ${tag}`); ok++; continue; }
      // 1) Omie
      await omieAlterarFamilia(x.conta, x.codigo_produto, x.alvo_codigo_familia);
      // 2) espelho produtos + produto_tipo
      await sbPatch('produtos', `codigo_produto=eq.${x.codigo_produto}&conta_omie=eq.${low}`, { codigo_familia: x.alvo_codigo_familia, familia_nome: x.alvo_nome });
      try { await sbPatch('produto_tipo', `codigo_produto=eq.${x.codigo_produto}&conta_omie=ilike.${x.conta}`, { familia: x.alvo_nome }); } catch { /* pode não existir linha */ }
      // 3) auditoria (best-effort)
      try {
        await sbInsert('audit_log', [{ user_id: null, user_nome: 'script (appnovat)', sistema: 'ajustes', acao: 'alterar_familia', entidade: 'produto', entidade_id: String(x.codigo_produto), entidade_label: `${x.sku} — ${String(x.descricao).slice(0, 60)}`, detalhes: { de: x.familia_atual, para: x.alvo_nome, codigo_familia: x.alvo_codigo_familia, conta: x.conta, origem: 'diag-maquinas-em-pecas' } }]);
      } catch (e) { console.log(`     (audit_log falhou, seguindo: ${e.message.slice(0, 80)})`); }
      // 4) razão: sai do grupo peça
      try { await sbPatch('estoque_movimentos', `codigo_produto=eq.${x.codigo_produto}&conta_omie=eq.${low}`, { grupo: 'maquina', familia: x.alvo_nome }); } catch (e) { console.log(`     (estoque_movimentos falhou: ${e.message.slice(0, 80)})`); }
      console.log(`  ✅ ${tag}`);
      ok++;
      await sleep(700);
    } catch (e) {
      console.log(`  ❌ ${tag}\n       ${e.message}`);
      fail++;
      await sleep(700);
    }
  }
  console.log(`\n${APPLY ? 'APLICADO' : 'DRY-RUN'} — ok=${ok} fail=${fail}`);
})();
