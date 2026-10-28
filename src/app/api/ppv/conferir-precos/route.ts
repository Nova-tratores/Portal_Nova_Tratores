// POST /api/ppv/conferir-precos  { itens: [{ codigo, preco, quantidade, conta? }] }
// Confere cada item contra o preço de venda ATUAL do cadastro (Produtos_Completos — a
// mesma tabela que o PPV e o Orçamento usam na busca) e contra o custo (produtos.cmc).
// Só leitura, sem Omie. Usado pelo PPV, pelo Orçamento e pela janela de faturar.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/estoque/supabase";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import {
  conferirPrecos, contaDaLinha, variantesCodigo,
  type ContaPreco, type CustoCadastro, type ItemParaConferir, type PrecoCadastro,
} from "@/lib/ppv/conferencia-precos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITENS = 200;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const podeOrc = auth.modulos.some((m) => m === "orcamentos" || m.startsWith("orcamentos:"));
  if (!temModuloPPV(auth) && !podeOrc) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const brutos: unknown[] = Array.isArray(body?.itens) ? body.itens.slice(0, MAX_ITENS) : [];
    const itens: ItemParaConferir[] = brutos.map((b) => {
      const o = (b || {}) as Record<string, unknown>;
      const c = String(o.conta || "").toUpperCase();
      return {
        codigo: String(o.codigo || "").trim(),
        preco: Number(o.preco) || 0,
        quantidade: Number(o.quantidade) || 0,
        conta: c === "NOVA" || c === "CASTRO" ? (c as ContaPreco) : null,
      };
    }).filter((i) => i.codigo);
    if (itens.length === 0) return NextResponse.json(conferirPrecos([], [], []));

    // com as grafias sem/com zeros na frente (código colado do Excel perde os zeros)
    const codigos = [...new Set(itens.flatMap((i) => variantesCodigo(i.codigo)))];

    // em lotes: com as variantes a lista pode passar de mil códigos (URL longa demais)
    const lotes: string[][] = [];
    for (let i = 0; i < codigos.length; i += 150) lotes.push(codigos.slice(i, i + 150));
    const respostas = await Promise.all(lotes.map((lote) => Promise.all([
      supabase.from("Produtos_Completos").select("Codigo_Produto, Descricao_Produto, Preco_Venda, Empresa, conta_omie").in("Codigo_Produto", lote),
      supabase.from("produtos").select("codigo, cmc, conta_omie").in("codigo", lote),
    ])));
    const cad = { data: respostas.flatMap(([c]) => c.data || []) };
    const cus = { data: respostas.flatMap(([, c]) => c.data || []) };
    for (const [c, u] of respostas) {
      if (c.error) console.error(`[conferir-precos] cadastro: ${c.error.message}`);
      if (u.error) console.error(`[conferir-precos] custo: ${u.error.message}`);
    }

    const cadastro: PrecoCadastro[] = (cad.data || []).map((l) => ({
      codigo: String(l.Codigo_Produto),
      conta: contaDaLinha(l.conta_omie, l.Empresa),
      preco: Number(l.Preco_Venda) || 0,
      descricao: String(l.Descricao_Produto || ""),
    }));
    const custos: CustoCadastro[] = (cus.data || []).map((l) => ({
      codigo: String(l.codigo),
      conta: contaDaLinha(l.conta_omie, ""),
      cmc: Number(l.cmc) || 0,
    }));

    return NextResponse.json(conferirPrecos(itens, cadastro, custos));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API conferir-precos] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
