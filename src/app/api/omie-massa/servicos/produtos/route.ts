// GET → "Produtos Utilizados" dos serviços do cadastro Omie (conta NOVA).
//   ?nCodServ=123 → só a composição desse serviço (rápido, 1 consulta).
//   sem parâmetro  → TODOS os serviços (1 ConsultarCadastroServico por serviço,
//                    ~200 chamadas — pode levar 1–2 minutos).
// O ListarCadastroServico não devolve a composição; só a consulta individual.
// Nome/código dos produtos vêm do Supabase (tabela produtos, conta minúscula),
// com fallback ConsultarProduto no Omie para códigos fora da tabela.
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import {
  listarTodosServicos, consultarServico, listarLocaisEstoque, contaDaQuery,
  omieProdutoCall, pausa, PAUSA_MS, type ProdutoOmie, type ProdutoUtilizadoOmie,
} from '@/lib/omie-massa/omie';
import { decodeOmieTexto } from '@/lib/omie/texto';
import { supabaseAdmin as supabase } from '@/lib/omie-massa/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function checarAcesso(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  // Página vive no módulo Ajustes: aceita o módulo inteiro ('ajustes'), a ação
  // granular ('ajustes:omie-massa') e o id antigo ('omie-massa', compat).
  const permitido = auth.isAdmin || ['ajustes', 'ajustes:omie-massa', 'omie-massa'].some((m) => auth.modulos.includes(m));
  if (!permitido) {
    return { erro: NextResponse.json({ error: 'Sem permissão (ajustes:omie-massa)' }, { status: 403 }) };
  }
  return { auth };
}

interface ProdutoLinha { codigo_produto: number; codigo: string; descricao: string; qtde: number; local: string }

// Resolve código/descrição dos produtos: Supabase em lote + fallback Omie
async function nomesDosProdutos(codigos: number[]): Promise<Map<number, { codigo: string; descricao: string }>> {
  const nomes = new Map<number, { codigo: string; descricao: string }>();
  for (let i = 0; i < codigos.length; i += 200) {
    const chunk = codigos.slice(i, i + 200);
    const { data, error } = await supabase.from('produtos')
      .select('codigo_produto, codigo, descricao')
      .eq('conta_omie', 'nova')
      .in('codigo_produto', chunk);
    if (error) throw new Error(`produtos: ${error.message}`);
    for (const p of data || []) nomes.set(Number(p.codigo_produto), { codigo: String(p.codigo ?? ''), descricao: String(p.descricao ?? '') });
  }
  const faltantes = codigos.filter((c) => !nomes.has(c));
  for (const c of faltantes) {
    try {
      const o = await omieProdutoCall<ProdutoOmie>('ConsultarProduto', { codigo_produto: c });
      nomes.set(c, { codigo: decodeOmieTexto(o.codigo), descricao: decodeOmieTexto(o.descricao) });
    } catch {
      nomes.set(c, { codigo: String(c), descricao: '(produto não encontrado)' });
    }
    await pausa(PAUSA_MS);
  }
  return nomes;
}

function montarLinhas(
  itens: ProdutoUtilizadoOmie[],
  nomes: Map<number, { codigo: string; descricao: string }>,
  locais: Map<number, string>,
): ProdutoLinha[] {
  return itens.map((p) => ({
    codigo_produto: Number(p.nCodProdutoPU),
    codigo: nomes.get(Number(p.nCodProdutoPU))?.codigo ?? String(p.nCodProdutoPU),
    descricao: nomes.get(Number(p.nCodProdutoPU))?.descricao ?? '',
    qtde: Number(p.nQtdePU) || 0,
    local: locais.get(Number(p.codigo_local_estoque)) || String(p.codigo_local_estoque || ''),
  }));
}

export async function GET(req: Request) {
  const { erro } = await checarAcesso(req);
  if (erro) return erro;
  const url = new URL(req.url);
  const conta = contaDaQuery(url.searchParams.get('conta'));
  const nCodServ = Number(url.searchParams.get('nCodServ') || 0);

  try {
    const locais = await listarLocaisEstoque(conta);

    // ---- um serviço só (modal rápido) ----
    if (nCodServ) {
      const s = await consultarServico(nCodServ, conta);
      const itens = s.produtosUtilizados?.produtoUtilizado || [];
      const nomes = await nomesDosProdutos([...new Set(itens.map((p) => Number(p.nCodProdutoPU)))]);
      return NextResponse.json({ produtos: montarLinhas(itens, nomes, locais) });
    }

    // ---- todos os serviços ----
    const cadastros = await listarTodosServicos(conta);
    const composicoes: Array<{ nCodServ: number; cCodigo: string; cDescricao: string; inativo: string; itens: ProdutoUtilizadoOmie[] }> = [];
    for (const cad of cadastros) {
      await pausa(PAUSA_MS);
      let itens: ProdutoUtilizadoOmie[] = [];
      try {
        const s = await consultarServico(cad.intListar.nCodServ, conta);
        itens = s.produtosUtilizados?.produtoUtilizado || [];
      } catch {
        // consulta individual falhou — segue com composição vazia
      }
      composicoes.push({
        nCodServ: cad.intListar.nCodServ,
        cCodigo: decodeOmieTexto(cad.cabecalho.cCodigo),
        cDescricao: decodeOmieTexto(cad.cabecalho.cDescricao),
        inativo: cad.info?.inativo ?? 'N',
        itens,
      });
    }

    const todosCodigos = [...new Set(composicoes.flatMap((c) => c.itens.map((p) => Number(p.nCodProdutoPU))))];
    const nomes = await nomesDosProdutos(todosCodigos);
    const servicos = composicoes.map((c) => ({
      nCodServ: c.nCodServ, cCodigo: c.cCodigo, cDescricao: c.cDescricao, inativo: c.inativo,
      produtos: montarLinhas(c.itens, nomes, locais),
    }));
    return NextResponse.json({ servicos, totalServicos: servicos.length, comProdutos: servicos.filter((s) => s.produtos.length).length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
