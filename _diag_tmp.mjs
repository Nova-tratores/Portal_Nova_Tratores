// Diagnóstico do backfill: conta linhas por conta/mês nas tabelas alimentadas
// pelos jobs (estoque_familia_snapshot, estoque_tipo_snapshot, notas_entrada).
// Uso: node _diag_tmp.mjs   (lê credenciais do .env.local)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, cols) {
  const out = [];
  let from = 0;
  const LOTE = 1000;
  for (;;) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + LOTE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < LOTE) break;
    from += LOTE;
  }
  return out;
}

const norm = (c) => String(c ?? '').toLowerCase();
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v)) || 0);

function resumo(rows, { temValor }) {
  // chave: conta|ano-mes  -> { linhas, valor }
  const map = new Map();
  for (const r of rows) {
    const k = `${norm(r.conta_omie)}|${r.ano}-${String(r.mes).padStart(2, '0')}`;
    const e = map.get(k) || { linhas: 0, valor: 0 };
    e.linhas++;
    if (temValor) e.valor += num(r.estoque_valor);
    map.set(k, e);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function imprimir(titulo, entradas, { temValor }) {
  console.log(`\n=== ${titulo} ===`);
  if (entradas.length === 0) {
    console.log('  (vazio — nenhuma linha)');
    return;
  }
  let contaAtual = '';
  for (const [k, v] of entradas) {
    const [conta, mes] = k.split('|');
    if (conta !== contaAtual) {
      contaAtual = conta;
      console.log(`  [conta=${conta}]`);
    }
    const valStr = temValor ? `  valor=R$ ${v.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '';
    console.log(`    ${mes}: ${String(v.linhas).padStart(5)} linhas${valStr}`);
  }
}

const fam = await fetchAll('estoque_familia_snapshot', 'ano,mes,conta_omie,estoque_valor');
const tipo = await fetchAll('estoque_tipo_snapshot', 'ano,mes,conta_omie,estoque_valor');
const notas = await fetchAll('notas_entrada', 'ano,mes,conta_omie');

imprimir('estoque_familia_snapshot (Estoque por família)', resumo(fam, { temValor: true }), { temValor: true });
imprimir('estoque_tipo_snapshot (Estoque por tipo / peças)', resumo(tipo, { temValor: true }), { temValor: true });
imprimir('notas_entrada (NF de entrada)', resumo(notas, { temValor: false }), { temValor: false });

console.log('\n--- Totais ---');
console.log(`estoque_familia_snapshot: ${fam.length} linhas`);
console.log(`estoque_tipo_snapshot:    ${tipo.length} linhas`);
console.log(`notas_entrada:            ${notas.length} linhas`);
