// Copia a Descrição (resumida) para a Descrição Detalhada (descr_detalhada)
// dos produtos do Omie ONDE A DETALHADA ESTÁ VAZIA — nunca sobrescreve conteúdo.
//
// Uso:  npx tsx scripts/descr-detalhada-copiar.ts                        → dry-run, NOVA + CASTRO
//       npx tsx scripts/descr-detalhada-copiar.ts --conta NOVA           → dry-run, só NOVA
//       npx tsx scripts/descr-detalhada-copiar.ts --aplicar              → grava, NOVA + CASTRO
//       npx tsx scripts/descr-detalhada-copiar.ts --conta CASTRO --aplicar
//       npx tsx scripts/descr-detalhada-copiar.ts --reparar --aplicar    → conserta detalhadas gravadas
//                                                                          com entidade HTML (&quot; etc.)
//
// ⚠ A API da Omie devolve os textos ESCAPADOS em HTML na saída (12" vira
// 12&quot;), mas espera texto puro na entrada. É OBRIGATÓRIO decodificar antes
// de gravar — a 1ª rodada (14/07/2026) gravou o texto escapado e poluiu os
// produtos com aspas/apóstrofo na descrição; o modo --reparar corrige.
//
// Segurança: verificado em 14/07/2026 que o ListarProdutos DEVOLVE a chave
// descr_detalhada (mas pode vir STALE para alterações recentes — o --reparar
// reconfere via ConsultarProduto). Gravação direta (1 chamada/produto).
// Re-rodar é seguro: já-preenchidos são pulados pelo filtro; regravar o mesmo
// valor é idempotente.

import { lerEnvLocal } from './servicos-omie-exportar';

// Decodifica as entidades HTML que a Omie usa na SAÍDA da API (uma passada).
function decodeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}
const temEntidade = (s?: string) => /&(quot|apos|amp|lt|gt|#\d+);/i.test(String(s ?? ''));

const OMIE_PROD_URL = 'https://app.omie.com.br/api/v1/geral/produtos/';
const PAUSA_MS = 350;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Conta = 'NOVA' | 'CASTRO';

interface ProdutoLista {
  codigo_produto: number;
  codigo?: string;
  descricao?: string;
  descr_detalhada?: string;
  inativo?: string;
}

function credenciais(env: Record<string, string>, conta: Conta): { app_key: string; app_secret: string } {
  const app_key = conta === 'NOVA' ? (env.OMIE_APP_KEY_NOVA || env.OMIE_APP_KEY) : env.OMIE_APP_KEY_CASTRO;
  const app_secret = conta === 'NOVA' ? (env.OMIE_APP_SECRET_NOVA || env.OMIE_APP_SECRET) : env.OMIE_APP_SECRET_CASTRO;
  if (!app_key || !app_secret) throw new Error(`Credenciais Omie da conta ${conta} não encontradas no .env.local`);
  return { app_key, app_secret };
}

async function omieCall<T>(cred: { app_key: string; app_secret: string }, call: string, param: object): Promise<T> {
  const res = await fetch(OMIE_PROD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, ...cred, param: [param] }),
  });
  const json = await res.json();
  if (json.faultstring) throw new Error(`Omie [${call}]: ${json.faultstring}`);
  return json as T;
}

async function listarTodos(cred: { app_key: string; app_secret: string }, conta: Conta): Promise<ProdutoLista[]> {
  const produtos: ProdutoLista[] = [];
  let pagina = 1;
  let totPaginas = 1;
  do {
    const r = await omieCall<{ total_de_paginas: number; produto_servico_cadastro?: ProdutoLista[] }>(
      cred, 'ListarProdutos',
      { pagina, registros_por_pagina: 200, filtrar_apenas_omiepdv: 'N' },
    );
    totPaginas = r.total_de_paginas || 1;
    produtos.push(...(r.produto_servico_cadastro || []));
    if (pagina % 5 === 0 || pagina === totPaginas) console.log(`  [${conta}] listando: página ${pagina}/${totPaginas} (${produtos.length} produtos)`);
    pagina++;
    if (pagina <= totPaginas) await pausa(PAUSA_MS);
  } while (pagina <= totPaginas);
  return produtos;
}

async function processarConta(env: Record<string, string>, conta: Conta, aplicar: boolean) {
  console.log(`\n===== ${conta} =====`);
  const cred = credenciais(env, conta);
  const todos = await listarTodos(cred, conta);

  const vazio = (s?: string) => String(s ?? '').trim() === '';
  const candidatos = todos.filter((p) => !vazio(p.descricao) && vazio(p.descr_detalhada));
  const jaPreenchidos = todos.filter((p) => !vazio(p.descr_detalhada)).length;
  console.log(`  ${todos.length} produtos no total · ${jaPreenchidos} já têm descr_detalhada · ${candidatos.length} candidatos a copiar`);

  if (!candidatos.length) return { conta, copiados: 0, pulados: 0, falhas: 0 };

  if (!aplicar) {
    console.log('  DRY-RUN (sem --aplicar). Amostra de candidatos, conferindo via ConsultarProduto:');
    for (const p of candidatos.slice(0, 5)) {
      const o = await omieCall<ProdutoLista>(cred, 'ConsultarProduto', { codigo_produto: p.codigo_produto });
      console.log(`   - ${p.codigo ?? p.codigo_produto}: descricao="${(o.descricao ?? '').slice(0, 60)}" | detalhada atual="${(o.descr_detalhada ?? '').slice(0, 40)}"`);
      await pausa(PAUSA_MS);
    }
    return { conta, copiados: 0, pulados: 0, falhas: 0 };
  }

  let copiados = 0, pulados = 0, falhas = 0;
  for (let i = 0; i < candidatos.length; i++) {
    const p = candidatos[i];
    try {
      await omieCall(cred, 'AlterarProduto', { codigo_produto: p.codigo_produto, descr_detalhada: decodeHtml(String(p.descricao)).trim() });
      copiados++;
    } catch (e: unknown) {
      falhas++;
      console.warn(`  FALHA ${p.codigo ?? p.codigo_produto}: ${e instanceof Error ? e.message : e}`);
      const msg = e instanceof Error ? e.message : String(e);
      if (/bloquead|consumo indevido/i.test(msg)) {
        const m = msg.match(/(\d+)\s*segundos?/i);
        const seg = m ? parseInt(m[1], 10) : 60;
        console.log(`  Omie bloqueou — aguardando ${seg}s para continuar...`);
        await pausa(seg * 1000);
        i--; // re-tenta o mesmo produto
        falhas--;
        continue;
      }
    }
    if ((copiados + pulados + falhas) % 25 === 0) {
      console.log(`  [${conta}] progresso: ${i + 1}/${candidatos.length} (copiados ${copiados}, pulados ${pulados}, falhas ${falhas})`);
    }
    await pausa(PAUSA_MS);
  }
  console.log(`  [${conta}] FIM: copiados ${copiados}, pulados ${pulados}, falhas ${falhas}`);
  return { conta, copiados, pulados, falhas };
}

// Repara descr_detalhada gravadas com entidade HTML literal (poluição da 1ª
// rodada): detecta pelo "escape duplo" na saída da API — decodificar UMA vez e
// ainda sobrar entidade = o texto armazenado contém &quot;/&apos; literais.
async function repararConta(env: Record<string, string>, conta: Conta, aplicar: boolean) {
  console.log(`\n===== REPARO ${conta} =====`);
  const cred = credenciais(env, conta);
  const todos = await listarTodos(cred, conta);
  const suspeitos = todos.filter((p) => temEntidade(p.descricao) || temEntidade(p.descr_detalhada));
  console.log(`  ${suspeitos.length} produtos com entidade HTML na descrição/detalhada (candidatos a reparo)`);

  let reparados = 0, ok = 0, falhas = 0;
  for (const p of suspeitos) {
    try {
      const o = await omieCall<ProdutoLista>(cred, 'ConsultarProduto', { codigo_produto: p.codigo_produto });
      await pausa(PAUSA_MS);
      const detalhadaArmazenada = decodeHtml(String(o.descr_detalhada ?? ''));  // desfaz o escape de SAÍDA
      if (detalhadaArmazenada.trim() === '' || !temEntidade(detalhadaArmazenada)) { ok++; continue; }
      const corrigida = decodeHtml(String(o.descricao ?? '')).trim();
      console.log(`  ${aplicar ? 'REPARANDO' : 'repararia'} ${p.codigo ?? p.codigo_produto}: "${detalhadaArmazenada.slice(0, 60)}" → "${corrigida.slice(0, 60)}"`);
      if (aplicar) {
        await omieCall(cred, 'AlterarProduto', { codigo_produto: p.codigo_produto, descr_detalhada: corrigida });
        await pausa(PAUSA_MS);
      }
      reparados++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/inativo/i.test(msg)) { ok++; continue; }  // inativo: nunca foi gravado (a 1ª rodada também falhou nele)
      falhas++;
      console.warn(`  FALHA reparo ${p.codigo ?? p.codigo_produto}: ${msg}`);
    }
  }
  console.log(`  [${conta}] reparo: ${reparados} ${aplicar ? 'reparados' : 'a reparar'}, ${ok} ok/limpos, ${falhas} falhas`);
  return { conta, copiados: reparados, pulados: ok, falhas };
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const reparar = args.includes('--reparar');
  const idx = args.indexOf('--conta');
  const contaArg = idx >= 0 ? String(args[idx + 1] || '').toUpperCase() : 'TODAS';
  const contas: Conta[] = contaArg === 'NOVA' ? ['NOVA'] : contaArg === 'CASTRO' ? ['CASTRO'] : ['NOVA', 'CASTRO'];

  const env = lerEnvLocal();
  console.log(`${reparar ? 'REPARO de entidades HTML na' : 'Copiar descricao →'} descr_detalhada · contas: ${contas.join(' + ')} · ${aplicar ? 'APLICANDO' : 'dry-run'}`);

  const resumo = [];
  for (const conta of contas) resumo.push(reparar ? await repararConta(env, conta, aplicar) : await processarConta(env, conta, aplicar));
  console.log('\nResumo:', resumo.map((r) => `${r.conta}: ${r.copiados} copiados/reparados, ${r.pulados} pulados, ${r.falhas} falhas`).join(' | '));
}

main().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
