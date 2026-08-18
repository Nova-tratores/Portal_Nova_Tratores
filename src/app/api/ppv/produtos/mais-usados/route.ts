import { NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel } from "@/lib/ppv/supabase";
import { TBL_ITENS } from "@/lib/ppv/constants";

// GET — Produtos MAIS UTILIZADOS nos pedidos (modal "Novo Item").
// Agrega as saídas mais recentes das movimentações e devolve o top 10.
export async function GET() {
  try {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_ITENS}?select=CodProduto,Descricao,Preco,TipoMovimento&order=id.desc&limit=1500`
      );
    } catch {
      // tabela sem coluna id — segue sem ordenação (ainda dá um retrato bom do uso)
      rows = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_ITENS}?select=CodProduto,Descricao,Preco,TipoMovimento&limit=1500`
      );
    }
    const cont = new Map<string, { codigo: string; descricao: string; preco: number; usos: number }>();
    for (const r of rows || []) {
      const tipo = String(getValorInsensivel(r, "TipoMovimento") || "").toLowerCase();
      if (!tipo.startsWith("sa")) continue; // só saídas (devoluções não contam uso)
      const codigo = String(getValorInsensivel(r, "CodProduto") || "").trim();
      if (!codigo) continue;
      const atual = cont.get(codigo);
      if (atual) {
        atual.usos++;
      } else {
        cont.set(codigo, {
          codigo,
          descricao: String(getValorInsensivel(r, "Descricao") || "").trim(),
          preco: parseFloat(String(getValorInsensivel(r, "Preco") || 0)) || 0,
          usos: 1,
        });
      }
    }
    const top = [...cont.values()].sort((a, b) => b.usos - a.usos).slice(0, 10);
    return NextResponse.json(top);
  } catch {
    return NextResponse.json([]);
  }
}
