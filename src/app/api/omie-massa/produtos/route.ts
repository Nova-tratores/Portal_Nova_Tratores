// GET  → ranking de produtos (conta NOVA) por família/estoque/vendas do mês
//        (Supabase) + dados editáveis atuais do Omie (ConsultarProduto).
//        Query: ?familia=&ordenar=vendas|estoque&top=50&mes=6&ano=2026
// POST → aplica alterações em massa via AlterarProduto (só campos que mudaram;
//        em produtos o Omie preserva o resto e "inativo" é editável).
import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { omieProdutoCall, diffProduto, pausa, PAUSA_MS, type ProdutoOmie } from '@/lib/omie-massa/omie';
import { supabaseAdmin as supabase, norm, familiasPorProduto } from '@/lib/omie-massa/supabase';

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

export async function GET(req: Request) {
  const { erro } = await checarAcesso(req);
  if (erro) return erro;
  const url = new URL(req.url);
  const filtroFamilia = url.searchParams.get('familia') || '';
  const ordenar = url.searchParams.get('ordenar') === 'estoque' ? 'estoque' : 'vendas';
  const top = Math.min(Math.max(parseInt(url.searchParams.get('top') || '50', 10) || 50, 1), 300);
  const agora = new Date();
  const mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const mes = parseInt(url.searchParams.get('mes') || String(mesAnterior.getMonth() + 1), 10);
  const ano = parseInt(url.searchParams.get('ano') || String(mesAnterior.getFullYear()), 10);

  try {
    const famPorProd = await familiasPorProduto();

    // Estoque atual (tabela produtos usa conta MINÚSCULA)
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

    // Vendas do mês (vendas_itens usa conta MAIÚSCULA → ilike)
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

    let candidatos = produtos.map((p) => ({
      ...p,
      familia: famPorProd.get(p.codigo_produto) || '',
      vendas_qtd: vendas.get(p.codigo_produto)?.qtd || 0,
      vendas_valor: Math.round((vendas.get(p.codigo_produto)?.valor || 0) * 100) / 100,
    }));
    if (filtroFamilia) {
      const alvo = norm(filtroFamilia);
      candidatos = candidatos.filter((p) => norm(p.familia).includes(alvo));
    }
    candidatos.sort((a, b) => ordenar === 'estoque'
      ? (b.estoque - a.estoque) || (b.vendas_qtd - a.vendas_qtd)
      : (b.vendas_qtd - a.vendas_qtd) || (b.estoque - a.estoque));
    const selecionados = candidatos.slice(0, top);

    // Dados editáveis atuais direto do Omie
    const linhas: Array<Record<string, string | number>> = [];
    for (const p of selecionados) {
      try {
        const o = await omieProdutoCall<ProdutoOmie>('ConsultarProduto', { codigo_produto: Number(p.codigo_produto) });
        linhas.push({
          codigo_produto: Number(p.codigo_produto), codigo: o.codigo ?? p.codigo,
          familia: p.familia, estoque: p.estoque, vendas_qtd: p.vendas_qtd, vendas_valor: p.vendas_valor,
          descricao: o.descricao ?? '', valor_unitario: Number(o.valor_unitario ?? 0),
          ncm: o.ncm ?? '', ean: o.ean ?? '', unidade: o.unidade ?? '', inativo: o.inativo ?? 'N',
        });
      } catch {
        // produto sem cadastro consultável — pula
      }
      await pausa(PAUSA_MS);
    }

    return NextResponse.json({ produtos: linhas, mes, ano, totalCandidatos: candidatos.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

interface ResultadoItem { codigo_produto: number; codigo: string; ok: boolean; erro?: string; campos: string[] }

export async function POST(req: Request) {
  const { erro } = await checarAcesso(req);
  if (erro) return erro;
  const body = await req.json().catch(() => null) as { alteracoes?: Array<Partial<ProdutoOmie> & { codigo_produto: number }> } | null;
  const alteracoes = body?.alteracoes || [];
  if (!alteracoes.length) return NextResponse.json({ error: 'Nenhuma alteração enviada' }, { status: 400 });

  const resultados: ResultadoItem[] = [];
  for (const row of alteracoes) {
    let atual: ProdutoOmie;
    try {
      atual = await omieProdutoCall<ProdutoOmie>('ConsultarProduto', { codigo_produto: Number(row.codigo_produto) });
    } catch (e: unknown) {
      resultados.push({ codigo_produto: Number(row.codigo_produto), codigo: '', ok: false, erro: `consulta falhou: ${e instanceof Error ? e.message : e}`, campos: [] });
      continue;
    }
    const { payload, mudancas } = diffProduto(row, atual);
    if (!mudancas.length) {
      resultados.push({ codigo_produto: atual.codigo_produto, codigo: atual.codigo, ok: true, campos: [] });
      continue;
    }
    try {
      await omieProdutoCall('AlterarProduto', payload);
      resultados.push({ codigo_produto: atual.codigo_produto, codigo: atual.codigo, ok: true, campos: mudancas.map((m) => m.campo) });
    } catch (e: unknown) {
      resultados.push({ codigo_produto: atual.codigo_produto, codigo: atual.codigo, ok: false, erro: e instanceof Error ? e.message : String(e), campos: mudancas.map((m) => m.campo) });
    }
    await pausa(PAUSA_MS);
  }
  return NextResponse.json({ resultados });
}
