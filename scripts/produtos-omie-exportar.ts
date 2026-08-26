// Exporta produtos do Omie (conta NOVA) para um CSV editável, priorizando por
// família / estoque / vendas do último mês (dados do Supabase). Depois de
// editar o CSV, aplicar com scripts/produtos-omie-aplicar.ts.
//
// Uso:
//   npx tsx scripts/produtos-omie-exportar.ts --familia "PECAS" --top 50
//   npx tsx scripts/produtos-omie-exportar.ts --ordenar estoque --top 100
//   npx tsx scripts/produtos-omie-exportar.ts --listar-familias   → só lista as famílias existentes
//
// Flags:
//   --familia TEXTO    filtra pela família (busca parcial, sem acento/caixa)
//   --top N            quantos produtos exportar (default 50)
//   --ordenar X        vendas (default) | estoque — critério de ranking
//   --mes M --ano A    mês das vendas (default: mês anterior ao atual)
//   --saida arquivo    CSV de saída (default scripts/produtos-omie.csv)
//
// Colunas de contexto (NÃO aplicadas): familia, estoque, vendas_qtd, vendas_valor.
// Colunas editáveis (aplicadas no Omie): descricao, valor_unitario, ncm, ean,
// unidade, inativo (S/N — em produtos o Omie ACEITA alterar via API).

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { lerEnvLocal } from './servicos-omie-exportar';

const OMIE_PROD_URL = 'https://app.omie.com.br/api/v1/geral/produtos/';
const PAUSA_MS = 350;

export interface ProdutoOmie {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  valor_unitario: number;
  ncm: string;
  ean: string;
  unidade: string;
  inativo: 'S' | 'N';
}

export async function omieProdutoCall<T>(env: Record<string, string>, call: string, param: object): Promise<T> {
  const res = await fetch(OMIE_PROD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call,
      app_key: env.OMIE_APP_KEY || env.OMIE_APP_KEY_NOVA,
      app_secret: env.OMIE_APP_SECRET || env.OMIE_APP_SECRET_NOVA,
      param: [param],
    }),
  });
  const json = await res.json();
  if (json.faultstring) throw new Error(`Omie [${call}]: ${json.faultstring}`);
  return json as T;
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function getFlag(args: string[], nome: string): string | undefined {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const celula = (v: string | number): string => {
  if (typeof v === 'number') return String(v).replace('.', ',');
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

async function main() {
  const args = process.argv.slice(2);
  const env = lerEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // --- 1. Famílias (produto_tipo) ---
  const famPorProd = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('produto_tipo')
      .select('codigo_produto, familia, conta_omie').range(from, from + 999);
    if (error) throw new Error(`produto_tipo: ${error.message}`);
    for (const p of data || []) {
      if (norm(String(p.conta_omie || '')) === 'nova' && p.familia) famPorProd.set(String(p.codigo_produto), String(p.familia));
    }
    if (!data || data.length < 1000) break;
  }

  if (args.includes('--listar-familias')) {
    const contagem = new Map<string, number>();
    for (const f of famPorProd.values()) contagem.set(f, (contagem.get(f) || 0) + 1);
    console.log('Famílias (produto_tipo, conta NOVA):');
    [...contagem.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${f} (${n} produtos)`));
    return;
  }

  const filtroFamilia = getFlag(args, 'familia');
  const top = parseInt(getFlag(args, 'top') || '50', 10);
  const ordenar = getFlag(args, 'ordenar') || 'vendas';
  const hoje = new Date();
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mes = parseInt(getFlag(args, 'mes') || String(mesAnterior.getMonth() + 1), 10);
  const ano = parseInt(getFlag(args, 'ano') || String(mesAnterior.getFullYear()), 10);
  const saida = resolve(getFlag(args, 'saida') || resolve(__dirname, 'produtos-omie.csv'));

  // --- 2. Estoque atual (produtos, conta minúscula) ---
  interface ProdBase { codigo_produto: string; codigo: string; descricao: string; estoque: number }
  const produtos: ProdBase[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('produtos')
      .select('codigo_produto, codigo, descricao, estoque')
      .eq('conta_omie', 'nova').eq('arquivado', false)
      .range(from, from + 999);
    if (error) throw new Error(`produtos: ${error.message}`);
    for (const p of data || []) produtos.push({ ...p, codigo_produto: String(p.codigo_produto), estoque: Number(p.estoque) || 0 });
    if (!data || data.length < 1000) break;
  }

  // --- 3. Vendas do mês (vendas_itens, conta maiúscula → ilike) ---
  const vendas = new Map<string, { qtd: number; valor: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('vendas_itens')
      .select('codigo_produto, quantidade, valor_total')
      .eq('mes', mes).eq('ano', ano).ilike('conta_omie', 'nova')
      .range(from, from + 999);
    if (error) throw new Error(`vendas_itens: ${error.message}`);
    for (const v of data || []) {
      const cod = String(v.codigo_produto);
      const agg = vendas.get(cod) || { qtd: 0, valor: 0 };
      agg.qtd += Number(v.quantidade) || 0;
      agg.valor += Number(v.valor_total) || 0;
      vendas.set(cod, agg);
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`Base: ${produtos.length} produtos | vendas de ${mes}/${ano}: ${vendas.size} produtos vendidos`);

  // --- 4. Filtro por família + ranking ---
  let candidatos = produtos.map((p) => ({
    ...p,
    familia: famPorProd.get(p.codigo_produto) || '',
    vendasQtd: vendas.get(p.codigo_produto)?.qtd || 0,
    vendasValor: vendas.get(p.codigo_produto)?.valor || 0,
  }));
  if (filtroFamilia) {
    const alvo = norm(filtroFamilia);
    candidatos = candidatos.filter((p) => norm(p.familia).includes(alvo));
    console.log(`Filtro família "${filtroFamilia}": ${candidatos.length} produtos`);
  }
  candidatos.sort((a, b) => ordenar === 'estoque'
    ? (b.estoque - a.estoque) || (b.vendasQtd - a.vendasQtd)
    : (b.vendasQtd - a.vendasQtd) || (b.estoque - a.estoque));
  const selecionados = candidatos.slice(0, top);
  console.log(`Selecionados: top ${selecionados.length} por ${ordenar}. Buscando dados atuais no Omie...`);

  // --- 5. Dados editáveis atuais direto do Omie (ConsultarProduto) ---
  const linhas = ['codigo_produto;codigo;familia;estoque;vendas_qtd;vendas_valor;descricao;valor_unitario;ncm;ean;unidade;inativo'];
  let falhas = 0;
  for (const [i, p] of selecionados.entries()) {
    try {
      const o = await omieProdutoCall<ProdutoOmie>(env, 'ConsultarProduto', { codigo_produto: Number(p.codigo_produto) });
      linhas.push([
        p.codigo_produto, o.codigo ?? p.codigo, p.familia, p.estoque, p.vendasQtd, Math.round(p.vendasValor * 100) / 100,
        o.descricao ?? '', Number(o.valor_unitario ?? 0), o.ncm ?? '', o.ean ?? '', o.unidade ?? '', o.inativo ?? 'N',
      ].map(celula).join(';'));
    } catch (e: unknown) {
      falhas++;
      console.warn(`  ERRO ${p.codigo}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${selecionados.length}...`);
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  writeFileSync(saida, '﻿' + linhas.join('\r\n'), 'utf8'); // BOM p/ Excel
  console.log(`OK: ${linhas.length - 1} produtos exportados (${falhas} falhas) → ${saida}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
