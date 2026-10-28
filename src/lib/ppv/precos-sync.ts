// Sync INCREMENTAL do cadastro de produtos: pede à Omie só os produtos ALTERADOS nos
// últimos dias (ListarProdutos com filtrar_apenas_alteracao) e, com a MESMA resposta,
// atualiza as duas tabelas — Produtos_Completos (preço do PPV/Orçamento) e `produtos`
// (cadastro do Estoque: descrição, família, marca, preço; estoque/CMC ficam com o sync
// de saldo). Leve: dezenas de produtos por dia (22/10/2026: 40 na NOVA, 1 página).
// `produtos` entrou em 27/10/2026 — antes só o sync completo diário (GitHub) a atualizava.
//
// Por quê: a tabela só era atualizada pelo botão "Sincronizar produtos". Em 22/10 Peças
// reajustou 7 peças às 13h, o PPV-0542 lançou às 16h28 com os preços antigos e a OS-0846
// saiu R$ 3.883,12 abaixo. O sync diário das 02h (tabela `produtos`) não teria pegado.
//
// Rodado pelo agendador do portal (tarefa ppv-precos-sync) a cada 10 min em horário comercial.
// A janela volta 3 dias (cobre domingo e o intervalo das 20h às 07h) — o upsert é
// idempotente, repetir produto não custa nada além da linha.
import { omieRequest } from '@/lib/estoque/omie';
import { getContasOmie, type Conta } from '@/lib/estoque/conta';
import { supabase } from '@/lib/estoque/supabase';
import { comCronRun } from '@/lib/cron/observar';
import { dentroDoHorarioComercial } from '@/lib/pecas/alocacao';
import {
  gravarCadastroProdutos, linhaCadastroProduto, mapaFamiliasDoBanco, produtoEntraNoCadastro, type OmieProdutoCadastro,
} from '@/lib/estoque/produtos-sync';

const EMPRESA: Record<Conta, string> = { NOVA: 'Nova Tratores', CASTRO: 'Castro Peças' };
const DIAS_JANELA = 3;
const POR_PAGINA = 500;

interface OmieProduto extends OmieProdutoCadastro {
  codigo_produto_integracao?: string;
}

export interface PrecosSyncConta { conta: Conta; alterados: number; cadastro?: number; erro?: string }

/** dd/mm/aaaa no fuso de São Paulo. */
function dataBR(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(brt.getUTCDate())}/${p(brt.getUTCMonth() + 1)}/${brt.getUTCFullYear()}`;
}

/** Linha de Produtos_Completos a partir do produto da Omie (mesmo mapa do /api/ppv/sync-produtos). */
export function linhaPrecoCompleto(p: OmieProduto, conta: Conta) {
  return {
    id_omie: p.codigo_produto,
    Codigo_Produto: p.codigo || p.codigo_produto_integracao || String(p.codigo_produto),
    Descricao_Produto: p.descricao || '',
    Preco_Unit: Number(p.valor_unitario) || 0,
    Preco_Venda: Number(p.valor_unitario) || 0,
    Empresa: EMPRESA[conta],
    conta_omie: conta,
  };
}

async function sincronizarConta(conta: Conta, de: string, ate: string): Promise<{ alterados: number; cadastro: number }> {
  let pagina = 1;
  let totalPaginas = 1;
  let total = 0;
  let cadastro = 0;
  let familias: Record<number, string> | null = null;
  while (pagina <= totalPaginas) {
    const r = await omieRequest<{ total_de_paginas?: number; produto_servico_cadastro?: OmieProduto[] }>(
      '/geral/produtos/', 'ListarProdutos',
      {
        pagina, registros_por_pagina: POR_PAGINA, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N',
        filtrar_apenas_alteracao: 'S', filtrar_por_data_de: de, filtrar_por_data_ate: ate, exibir_caracteristicas: 'N',
      },
      { conta, retries: 2, maxWaitMs: 30_000 },
    );
    totalPaginas = Number(r.total_de_paginas) || 1;
    const linhas = (r.produto_servico_cadastro || []).filter((p) => p.codigo_produto).map((p) => linhaPrecoCompleto(p, conta));
    if (linhas.length > 0) {
      const { error } = await supabase.from('Produtos_Completos').upsert(linhas, { onConflict: 'id_omie' });
      if (error) throw new Error(`upsert Produtos_Completos: ${error.message}`);
      total += linhas.length;
      // cadastro do Estoque (mesma regra do sync completo: só ativo e fora das famílias ocultas)
      familias = familias ?? await mapaFamiliasDoBanco(conta);
      const fam = familias;
      const cad = (r.produto_servico_cadastro || [])
        .filter((p) => p.codigo_produto && produtoEntraNoCadastro(p, fam))
        .map((p) => linhaCadastroProduto(p, conta, fam));
      await gravarCadastroProdutos(cad);
      cadastro += cad.length;
    }
    pagina++;
  }
  return { alterados: total, cadastro };
}

/** Busca na Omie os produtos alterados nos últimos `dias` e atualiza a tabela de preços. */
export async function sincronizarPrecosAlterados(agora: Date = new Date(), dias = DIAS_JANELA): Promise<PrecosSyncConta[]> {
  const de = dataBR(new Date(agora.getTime() - dias * 86_400_000));
  const ate = dataBR(agora);
  const saida: PrecosSyncConta[] = [];
  for (const { id } of getContasOmie()) {
    try {
      saida.push({ conta: id, ...(await sincronizarConta(id, de, ate)) });
    } catch (e) {
      const msg = (e as Error).message;
      // "não existem registros" = nenhum produto alterado na janela, não é erro
      if (/n[ãa]o existem registros/i.test(msg)) saida.push({ conta: id, alterados: 0 });
      else saida.push({ conta: id, alterados: 0, erro: msg });
    }
  }
  return saida;
}

/** Chamado pelo agendador interno: só em horário comercial, registra em cron_runs. */
export async function rodarPrecosSyncAgendado(agora: Date = new Date()): Promise<string | null> {
  if (!dentroDoHorarioComercial(agora)) return null;
  const r = await comCronRun('ppv-precos-sync', async () => {
    const res = await sincronizarPrecosAlterados(agora);
    const erros = res.filter((c) => c.erro);
    if (erros.length === res.length && erros.length > 0) throw new Error(erros.map((c) => `${c.conta}: ${c.erro}`).join(' | '));
    return res;
  }, { lockMinutos: 8 });
  if (r.pulado) return 'pulado (rodada anterior ainda aberta)';
  if (r.erro) return 'erro: ' + r.erro;
  const res = r.resultado || [];
  const erros = res.filter((c) => c.erro).map((c) => `${c.conta}: ${c.erro}`);
  return erros.length ? `erros: ${erros.join(' | ')}` : null;
}
