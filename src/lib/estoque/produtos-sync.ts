// Sync Omie -> Supabase da tabela `produtos` (a que alimenta /visual-estoque).
// Portado do app externo "Visual Estoque" (src/omie-api.js): sincronizar() +
// sincronizarApenasEstoque() e helpers. Adaptado para a infra do portal:
//   - omieRequest por options ({ conta, retries, maxWaitMs }) de ./omie
//   - cliente service-role de ./supabase
//   - conta_omie gravado em MINÚSCULO (a tabela usa 'nova'/'castro'), enquanto o
//     tipo Conta do portal é MAIÚSCULO — ponte via contaLow().
//
// onConflict do upsert: 'codigo_produto,conta_omie'. O upsert é PARCIAL:
// estoque/cmc/valor_estoque só entram quando a consulta Omie deu certo, e
// imagem_url só quando a Omie tem imagem. Assim não zeramos saldo por erro de API
// nem apagamos imagem/ambiente/pos_x/pos_y/arquivado/modelo definidos no portal.

import { omieRequest, consultarEstoque as omieConsultarEstoque, type OmieRequestOpts } from './omie';
import { type Conta } from './conta';
import { supabase } from './supabase';
import { sleep } from './utils';

const FAMILIAS_OCULTAS = ['.Inativo', '####Requisição####', 'Sem família'];
const API_DELAY = 1200; // ms entre chamadas Omie (rate limit)

// Opções de omieRequest para jobs de background: mais retries e espera maior.
const OMIE_OPTS = (conta: Conta): OmieRequestOpts => ({ conta, retries: 3, maxWaitMs: 60_000 });

// conta_omie na tabela `produtos`/`familias` é minúsculo; Conta do portal é maiúsculo.
function contaLow(c: Conta): string {
  return String(c).toLowerCase();
}

// Trava em memória (por instância) para evitar runs concorrentes batendo na Omie.
let syncEmAndamento = false;

// ---- Tipos crus da Omie ----

interface OmieFamilia {
  codFamilia?: number;
  codigo?: number;
  nomeFamilia?: string;
  descricao?: string;
}

interface OmieProdutoCadastro {
  codigo_produto: number;
  codigo?: string;
  descricao?: string;
  codigo_familia?: number;
  descricao_familia?: string;
  marca?: string;
  inativo?: string; // 'S' | 'N'
  valor_unitario?: number;
  info?: { dInc?: string };
  caracteristicas?: Array<{ cNomeCaract?: string; cConteudo?: string }>;
  imagens?: Array<{ url_imagem?: string }>;
}

interface OmieLocalEstoque {
  codigo_local_estoque?: number;
  descricao?: string;
  codigo?: string;
  inativo?: string;
}

interface OmiePosEstoqueItem {
  nCodProd?: number;
  nSaldo?: number;
  fisico?: number;
  nCMC?: number;
}

interface ProdutoRow {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  codigo_familia: number | null;
  familia_nome: string;
  marca: string;
  data_inclusao: string;
  tipo: string;
  inativo: boolean;
  conta_omie: string;
  valor_unitario: number;
  estoque?: number;
  cmc?: number;
  valor_estoque?: number;
  imagem_url?: string;
}

function dataHojeBR(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function resolverFamilia(produto: OmieProdutoCadastro, mapaFamilias: Record<number, string>): string {
  if (produto.descricao_familia?.trim()) return produto.descricao_familia.trim();
  if (produto.codigo_familia) return mapaFamilias[produto.codigo_familia] || 'Sem família';
  return 'Sem família';
}

// Famílias da conta -> upsert em `familias` e retorna mapa codigo_familia -> nome.
async function syncFamilias(conta: Conta): Promise<Record<number, string>> {
  const mapa: Record<number, string> = {};
  let pagina = 1;
  while (true) {
    try {
      const data = await omieRequest<{ famCadastro?: OmieFamilia[] }>(
        '/geral/familias/',
        'PesquisarFamilias',
        { pagina, registros_por_pagina: 500 },
        OMIE_OPTS(conta),
      );
      const familias = data.famCadastro || [];
      if (familias.length === 0) break;
      const lote: Array<{ codigo_familia: number; nome: string; conta_omie: string }> = [];
      for (const f of familias) {
        const codigo = f.codFamilia ?? f.codigo;
        const nome = f.nomeFamilia || f.descricao || 'Sem nome';
        if (codigo) {
          mapa[codigo] = nome;
          lote.push({ codigo_familia: codigo, nome, conta_omie: contaLow(conta) });
        }
      }
      if (lote.length > 0) {
        await supabase.from('familias').upsert(lote, { onConflict: 'codigo_familia,conta_omie' });
      }
      if (familias.length < 500) break;
      pagina++;
      await sleep(API_DELAY);
    } catch (e) {
      console.error('syncFamilias erro:', (e as Error).message);
      break;
    }
  }
  console.log(`SYNC Familias [${conta}]: ${Object.keys(mapa).length}`);
  return mapa;
}

async function buscarTodosProdutosDaOmie(conta: Conta): Promise<OmieProdutoCadastro[]> {
  const todos: OmieProdutoCadastro[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const data = await omieRequest<{ produto_servico_cadastro?: OmieProdutoCadastro[]; total_de_paginas?: number }>(
      '/geral/produtos/',
      'ListarProdutos',
      { pagina, registros_por_pagina: 500, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N' },
      OMIE_OPTS(conta),
    );
    if (data.total_de_paginas) totalPaginas = data.total_de_paginas;
    const produtos = data.produto_servico_cadastro || [];
    if (produtos.length === 0) break;
    todos.push(...produtos);
    console.log(`SYNC Produtos [${conta}] pag ${pagina}/${totalPaginas}: ${produtos.length} (total: ${todos.length})`);
    pagina++;
    if (pagina <= totalPaginas) await sleep(API_DELAY);
  }
  return todos;
}

// Locais de estoque ativos da conta.
async function buscarLocaisEstoque(conta: Conta): Promise<Array<{ id: number; nome: string }>> {
  const locais: Array<{ id: number; nome: string }> = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const data = await omieRequest<{ locaisEncontrados?: OmieLocalEstoque[]; nTotPaginas?: number }>(
      '/estoque/local/',
      'ListarLocaisEstoque',
      { nPagina: pagina, nRegPorPagina: 500 },
      OMIE_OPTS(conta),
    );
    if (data.nTotPaginas) totalPaginas = data.nTotPaginas;
    const lista = data.locaisEncontrados || [];
    if (lista.length === 0) break;
    for (const l of lista) {
      if (l.inativo === 'S') continue;
      if (l.codigo_local_estoque) {
        locais.push({ id: l.codigo_local_estoque, nome: l.descricao || l.codigo || String(l.codigo_local_estoque) });
      }
    }
    pagina++;
    if (pagina <= totalPaginas) await sleep(API_DELAY);
  }
  return locais;
}

// Posição de estoque de TODOS os produtos, iterando cada local e agregando
// saldo por produto (CMC ponderado pelo saldo). Retorna Map<codigo, {saldo, cmc}>.
// `dataPosicao` (DD/MM/YYYY) permite consultar a posição numa data passada
// (usado pelo backfill de snapshot histórico); default = hoje.
export async function buscarPosicaoEstoqueBulkOmie(conta: Conta, dataPosicao?: string): Promise<Map<number, { saldo: number; cmc: number }>> {
  const locais = await buscarLocaisEstoque(conta);
  console.log(`SYNC [${conta}]: ${locais.length} locais de estoque: ${locais.map((l) => l.nome).join(', ')}`);
  await sleep(API_DELAY);

  if (locais.length === 0) throw new Error('Nenhum local de estoque ativo encontrado');

  const acumulado = new Map<number, { saldo: number; cmcSum: number; cmcWeight: number }>();
  const dataPos = dataPosicao || dataHojeBR();

  for (const local of locais) {
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= totalPaginas) {
      const data = await omieRequest<{ produtos?: OmiePosEstoqueItem[]; nTotPaginas?: number }>(
        '/estoque/consulta/',
        'ListarPosEstoque',
        { nPagina: pagina, nRegPorPagina: 500, dDataPosicao: dataPos, cExibeTodos: 'S', codigo_local_estoque: local.id },
        OMIE_OPTS(conta),
      );
      if (data.nTotPaginas) totalPaginas = data.nTotPaginas;
      const produtos = data.produtos || [];
      if (produtos.length === 0) break;

      for (const p of produtos) {
        const id = p.nCodProd;
        if (!id) continue;
        const saldo = Number(p.nSaldo ?? p.fisico ?? 0) || 0;
        const cmc = Number(p.nCMC ?? 0) || 0;

        let entry = acumulado.get(id);
        if (!entry) {
          entry = { saldo: 0, cmcSum: 0, cmcWeight: 0 };
          acumulado.set(id, entry);
        }
        entry.saldo += saldo;
        if (cmc > 0) {
          const peso = saldo > 0 ? saldo : 1;
          entry.cmcSum += cmc * peso;
          entry.cmcWeight += peso;
        }
      }

      pagina++;
      if (pagina <= totalPaginas) await sleep(API_DELAY);
    }
    await sleep(API_DELAY);
  }

  const mapa = new Map<number, { saldo: number; cmc: number }>();
  for (const [id, v] of acumulado) {
    mapa.set(id, { saldo: v.saldo, cmc: v.cmcWeight > 0 ? v.cmcSum / v.cmcWeight : 0 });
  }
  return mapa;
}

async function salvarLoteSupabase(rows: ProdutoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('produtos').upsert(rows, { onConflict: 'codigo_produto,conta_omie' });
  if (error) {
    console.error('salvarLoteSupabase erro:', error.message);
    throw new Error(error.message);
  }
}

// Fallback per-produto (PosicaoEstoque) reusando o helper de ./omie.
async function consultarEstoqueProduto(idProduto: number, conta: Conta): Promise<{ saldo: number; cmc: number; ok: boolean }> {
  try {
    const data = await omieConsultarEstoque(idProduto, conta);
    return { saldo: data.saldo ?? 0, cmc: data.cmc ?? 0, ok: true };
  } catch (e) {
    console.error(`consultarEstoque ${idProduto} [${conta}]:`, (e as Error).message);
    return { saldo: 0, cmc: 0, ok: false };
  }
}

// ============================================================
// SYNC COMPLETO: famílias + produtos + estoque -> upsert produtos
// ============================================================
export async function sincronizarProdutos(conta: Conta): Promise<{ ok: boolean; totalProdutos?: number; errosEstoque?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;

  try {
    // 1. Famílias
    const mapaFamilias = await syncFamilias(conta);
    await sleep(API_DELAY);

    // 2. Produtos
    const todosProdutos = await buscarTodosProdutosDaOmie(conta);
    await sleep(API_DELAY);

    // 3. Filtrar inativos / famílias ocultas
    const produtosFiltrados = todosProdutos.filter((p) => {
      if (p.inativo === 'S') return false;
      const familia = resolverFamilia(p, mapaFamilias);
      return !FAMILIAS_OCULTAS.includes(familia);
    });
    console.log(`SYNC [${conta}]: ${produtosFiltrados.length} produtos após filtro (de ${todosProdutos.length})`);

    // 3.5 Posição de estoque em bulk (todos os locais)
    let mapaEstoque = new Map<number, { saldo: number; cmc: number }>();
    let bulkOk = false;
    try {
      mapaEstoque = await buscarPosicaoEstoqueBulkOmie(conta);
      bulkOk = true;
      console.log(`SYNC [${conta}]: bulk estoque retornou ${mapaEstoque.size} produtos`);
    } catch (e) {
      console.error(`SYNC [${conta}]: erro no bulk de estoque, caindo para fallback per-produto:`, (e as Error).message);
    }
    await sleep(API_DELAY);

    // 4. Montar rows e salvar em lotes
    const BATCH_SAVE = 50;
    let buffer: ProdutoRow[] = [];
    let errosEstoque = 0;

    for (let i = 0; i < produtosFiltrados.length; i++) {
      const produto = produtosFiltrados[i];

      let estoque = { saldo: 0, cmc: 0, ok: false };
      if (produto.codigo_produto) {
        const posicao = mapaEstoque.get(produto.codigo_produto);
        if (posicao) {
          estoque = { saldo: posicao.saldo, cmc: posicao.cmc, ok: true };
        } else if (!bulkOk) {
          // Bulk falhou inteiro: usa endpoint per-produto.
          estoque = await consultarEstoqueProduto(produto.codigo_produto, conta);
          await sleep(API_DELAY);
        }
        // bulkOk=true mas produto não veio: preserva estoque atual (ok=false).
      }

      const tipoCaract = (produto.caracteristicas || []).find(
        (c) => (c.cNomeCaract || '').toLowerCase() === 'tipo',
      );

      const row: ProdutoRow = {
        codigo_produto: produto.codigo_produto,
        codigo: produto.codigo || '',
        descricao: produto.descricao || '',
        codigo_familia: produto.codigo_familia || null,
        familia_nome: resolverFamilia(produto, mapaFamilias),
        marca: produto.marca || '',
        data_inclusao: produto.info?.dInc || '',
        tipo: tipoCaract?.cConteudo || '',
        inativo: false,
        conta_omie: contaLow(conta),
        valor_unitario: Number(produto.valor_unitario) || 0,
      };

      // Só atualiza estoque se a consulta foi bem-sucedida (não zera por erro de API).
      if (estoque.ok) {
        row.estoque = estoque.saldo;
        row.cmc = estoque.cmc;
        row.valor_estoque = estoque.saldo * estoque.cmc;
      } else {
        errosEstoque++;
      }
      // Só sobrescreve imagem se a Omie tiver uma (preserva imagens manuais).
      const imgOmie = produto.imagens?.[0]?.url_imagem;
      if (imgOmie) row.imagem_url = imgOmie;

      buffer.push(row);

      if (buffer.length >= BATCH_SAVE || i === produtosFiltrados.length - 1) {
        await salvarLoteSupabase(buffer);
        buffer = [];
      }
    }

    console.log(`SYNC CONCLUIDO [${conta}]: ${produtosFiltrados.length} produtos (${errosEstoque} erros de estoque - preservados)`);
    return { ok: true, totalProdutos: produtosFiltrados.length, errosEstoque };
  } catch (e) {
    console.error(`SYNC ERRO [${conta}]:`, (e as Error).message);
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}

// ============================================================
// SYNC RÁPIDO: só atualiza estoque/cmc/valor das linhas existentes
// ============================================================
export async function sincronizarApenasEstoque(conta: Conta): Promise<{ ok: boolean; total?: number; atualizados?: number; erros?: number; mensagem?: string }> {
  if (syncEmAndamento) return { ok: false, mensagem: 'Sync já em andamento' };
  syncEmAndamento = true;

  try {
    const mapa = await buscarPosicaoEstoqueBulkOmie(conta);
    console.log(`SYNC ESTOQUE [${conta}]: ${mapa.size} produtos retornados pelo bulk`);

    const entries = Array.from(mapa.entries());
    const CHUNK = 25;
    let atualizados = 0;
    let erros = 0;

    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async ([codigo_produto, { saldo, cmc }]) => {
          const { error, count } = await supabase
            .from('produtos')
            .update({ estoque: saldo, cmc, valor_estoque: saldo * cmc }, { count: 'exact' })
            .eq('codigo_produto', codigo_produto)
            .eq('conta_omie', contaLow(conta));
          if (error) {
            erros++;
            console.error(`SYNC ESTOQUE update ${codigo_produto} [${conta}]:`, error.message);
          } else if ((count || 0) > 0) {
            atualizados++;
          }
        }),
      );
    }

    console.log(`SYNC ESTOQUE CONCLUIDO [${conta}]: ${atualizados} atualizados, ${erros} erros`);
    return { ok: true, total: entries.length, atualizados, erros };
  } catch (e) {
    console.error(`SYNC ESTOQUE ERRO [${conta}]:`, (e as Error).message);
    return { ok: false, mensagem: (e as Error).message };
  } finally {
    syncEmAndamento = false;
  }
}
