import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel } from "@/lib/ppv/supabase";
import { TBL_PRODUTOS, TBL_PRODUTOS_MANUAIS } from "@/lib/ppv/constants";
import { buscaTermoSchema, produtoManualSchema } from "@/lib/ppv/schemas";
import type { ProdutoBusca } from "@/lib/ppv/types";

// GET - Buscar produtos
export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";
  const parsed = buscaTermoSchema.safeParse({ termo });
  if (!parsed.success) return NextResponse.json([]);

  const query = parsed.data.termo.replace(/ /g, "%");
  const resultados: ProdutoBusca[] = [];

  try {
    const res1 = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PRODUTOS}?or=(Codigo_Produto.ilike.*${query}*,Descricao_Produto.ilike.*${query}*)&select=Codigo_Produto,Descricao_Produto,Preco_Venda,Empresa&limit=40`
    );
    res1.forEach((row) => {
      resultados.push({
        codigo: String(getValorInsensivel(row, "Codigo_Produto", "codigo") || "").trim(),
        descricao: String(getValorInsensivel(row, "Descricao_Produto", "descricao") || "").trim(),
        preco: parseFloat(String(getValorInsensivel(row, "Preco_Venda", "preco") || 0)),
        origem: "completos",
        empresa: String(row.Empresa || "").trim() || undefined,
      });
    });
  } catch (e) {
    console.error("Erro busca Produtos:", e);
  }

  try {
    const res2 = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PRODUTOS_MANUAIS}?or=(Prod_Codigo.ilike.*${query}*,Prod_Descricao.ilike.*${query}*)&select=*&limit=20`
    );
    res2.forEach((row) => {
      const precoRaw = row.Prod_Preco;
      resultados.push({
        id_manual: row.id as number,
        codigo: String(row.Prod_Codigo || "").trim(),
        descricao: String(row.Prod_Descricao || "").trim(),
        preco: typeof precoRaw === "string"
          ? parseFloat(precoRaw.replace(",", "."))
          : parseFloat(String(precoRaw || 0)),
        origem: "manuais",
      });
    });
  } catch (e) {
    console.error("Erro busca Produtos Manuais:", e);
  }

  return NextResponse.json(resultados);
}

// POST - Salvar produto manual
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = produtoManualSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    const dados = parsed.data;

    const payload = {
      Prod_Codigo: dados.codigo,
      Prod_Descricao: dados.descricao,
      Prod_Preco: dados.preco,
    };

    if (dados.id) {
      await supabaseFetch(`${TBL_PRODUTOS_MANUAIS}?id=eq.${dados.id}`, "PATCH", payload);
    } else {
      await supabaseFetch(TBL_PRODUTOS_MANUAIS, "POST", [payload]);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
