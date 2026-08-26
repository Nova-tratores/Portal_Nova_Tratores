// Aplica em massa no Omie (conta NOVA) as alterações feitas no CSV gerado por
// scripts/produtos-omie-exportar.ts. Consulta o estado atual de cada produto
// (ConsultarProduto), compara e chama AlterarProduto SÓ para o que mudou —
// enviando apenas os campos alterados (o Omie preserva o resto).
//
// Uso:  npx tsx scripts/produtos-omie-aplicar.ts [arquivo.csv]            → dry-run (só mostra o diff)
//       npx tsx scripts/produtos-omie-aplicar.ts --aplicar [arquivo.csv]  → grava no Omie
//       (default: scripts/produtos-omie.csv)
//
// Campos aplicados: descricao, valor_unitario, ncm, ean, unidade, inativo (S/N).
// As colunas codigo, familia, estoque, vendas_* são só contexto — ignoradas.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerEnvLocal } from './servicos-omie-exportar';
import { omieProdutoCall, type ProdutoOmie } from './produtos-omie-exportar';

const PAUSA_MS = 350;
const CAMPOS_TXT = ['descricao', 'ncm', 'ean', 'unidade'] as const;

function parseCsv(texto: string): Array<Record<string, string>> {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const parseLinha = (l: string): string[] => {
    const campos: string[] = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (aspas) {
        if (c === '"' && l[i + 1] === '"') { atual += '"'; i++; }
        else if (c === '"') aspas = false;
        else atual += c;
      } else if (c === '"') aspas = true;
      else if (c === ';') { campos.push(atual); atual = ''; }
      else atual += c;
    }
    campos.push(atual);
    return campos;
  };
  const cab = parseLinha(linhas[0]);
  return linhas.slice(1).map((l) => {
    const vals = parseLinha(l);
    const row: Record<string, string> = {};
    cab.forEach((c, i) => { row[c] = (vals[i] ?? '').trim(); });
    return row;
  });
}

const numSimples = (s: string) => parseFloat(String(s).replace(',', '.')) || 0;

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const arquivo = resolve(args.find((a) => a !== '--aplicar') || resolve(__dirname, 'produtos-omie.csv'));

  const env = lerEnvLocal();
  const rows = parseCsv(readFileSync(arquivo, 'utf8'));
  console.log(`CSV: ${rows.length} linhas. Comparando com o Omie...`);

  const pendentes: Array<{ row: Record<string, string>; atual: ProdutoOmie; payload: Record<string, string | number>; mudancas: string[] }> = [];
  for (const row of rows) {
    let atual: ProdutoOmie;
    try {
      atual = await omieProdutoCall<ProdutoOmie>(env, 'ConsultarProduto', { codigo_produto: Number(row.codigo_produto) });
    } catch (e: unknown) {
      console.warn(`AVISO: produto ${row.codigo_produto} (${row.codigo}) não consultável — linha ignorada: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const payload: Record<string, string | number> = { codigo_produto: Number(row.codigo_produto) };
    const mudancas: string[] = [];
    for (const c of CAMPOS_TXT) {
      if (row[c] !== undefined && row[c] !== String(atual[c] ?? '')) {
        payload[c] = row[c];
        mudancas.push(`${c}: "${atual[c] ?? ''}" → "${row[c]}"`);
      }
    }
    if (row.valor_unitario !== undefined && numSimples(row.valor_unitario) !== Number(atual.valor_unitario ?? 0)) {
      payload.valor_unitario = numSimples(row.valor_unitario);
      mudancas.push(`valor_unitario: ${atual.valor_unitario} → ${numSimples(row.valor_unitario)}`);
    }
    if (row.inativo !== undefined && row.inativo.toUpperCase() !== (atual.inativo ?? 'N')) {
      payload.inativo = row.inativo.toUpperCase();
      mudancas.push(`inativo: ${atual.inativo ?? 'N'} → ${row.inativo.toUpperCase()}`);
    }
    if (mudancas.length) pendentes.push({ row, atual, payload, mudancas });
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  if (!pendentes.length) { console.log('Nada mudou — nenhum produto para alterar.'); return; }

  console.log(`\n${pendentes.length} produto(s) com alterações:\n`);
  for (const p of pendentes) {
    console.log(`• ${p.atual.codigo} (${p.row.codigo_produto}) — ${p.atual.descricao}`);
    for (const m of p.mudancas) console.log(`    ${m}`);
  }

  if (!aplicar) {
    console.log('\nDRY-RUN: nada foi gravado. Rode com --aplicar para efetivar.');
    return;
  }

  console.log('\nAplicando no Omie...');
  let ok = 0;
  let falhas = 0;
  for (const p of pendentes) {
    try {
      await omieProdutoCall(env, 'AlterarProduto', p.payload);
      ok++;
      console.log(`  OK  ${p.atual.codigo}`);
    } catch (e: unknown) {
      falhas++;
      console.error(`  ERRO ${p.atual.codigo}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  console.log(`\nConcluído: ${ok} alterado(s), ${falhas} falha(s).`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
