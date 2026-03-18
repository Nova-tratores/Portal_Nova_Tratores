import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_ITENS } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const ppv = req.nextUrl.searchParams.get("ppv") || "";
  const listaIds = ppv.split(",").map((s) => s.trim()).filter(Boolean);
  if (!listaIds.length) return NextResponse.json([]);

  const { data: items } = await supabase.from(TBL_ITENS).select("*").in("Id_PPV", listaIds);
  const resumo: Record<string, { descricao: string; qtde: number; totalFinanceiro: number }> = {};

  (items || []).forEach((item) => {
    const cod = item.CodProduto;
    const desc = item.Descricao;
    const tipo = String(item.TipoMovimento || "").toLowerCase();
    const preco = parseFloat(item.Preco || 0);
    let qtd = Math.abs(parseFloat(item.Qtde || 0));
    if (tipo.includes("devolu")) qtd = -qtd;
    if (!resumo[cod]) resumo[cod] = { descricao: desc, qtde: 0, totalFinanceiro: 0 };
    resumo[cod].qtde += qtd;
    resumo[cod].totalFinanceiro += preco * qtd;
  });

  const produtos = Object.values(resumo)
    .map((p) => ({ descricao: p.descricao, qtde: p.qtde, valor: p.qtde !== 0 ? p.totalFinanceiro / p.qtde : 0 }))
    .filter((p) => p.qtde !== 0);

  return NextResponse.json(produtos);
}
