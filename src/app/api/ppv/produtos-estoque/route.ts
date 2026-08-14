// GET /api/ppv/produtos-estoque?termo=...  → lista de "Peças em estoque"
// (tabela `produtos`, só com estoque > 0). Busca por código/descrição. Limitado.
import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/ppv/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProdutoEstoque {
  codigo: string; descricao: string; estoque: number; valor: number; cmc: number; conta: string;
}

export async function GET(req: NextRequest) {
  const termo = (req.nextUrl.searchParams.get("termo") || "").trim();
  const q = termo.replace(/ /g, "%");
  const filtroBusca = q ? `&or=(codigo.ilike.*${q}*,descricao.ilike.*${q}*)` : "";
  try {
    const rows = await supabaseFetch<Record<string, unknown>[]>(
      `produtos?estoque=gt.0${filtroBusca}&select=codigo,descricao,estoque,valor_unitario,cmc,conta_omie&order=descricao.asc&limit=300`,
    );
    const lista: ProdutoEstoque[] = (rows || []).map((r) => ({
      codigo: String(r.codigo || "").trim(),
      descricao: String(r.descricao || "").trim(),
      estoque: Number(r.estoque) || 0,
      valor: Number(r.valor_unitario) || 0,
      cmc: Number(r.cmc) || 0,
      conta: String(r.conta_omie || "").toUpperCase(),
    }));
    return NextResponse.json({ produtos: lista });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API ppv/produtos-estoque]", msg);
    return NextResponse.json({ error: msg, produtos: [] }, { status: 500 });
  }
}
