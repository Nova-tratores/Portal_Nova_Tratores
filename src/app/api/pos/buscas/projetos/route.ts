import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_PROJETOS_DB } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";

  if (!termo.trim()) {
    const { data } = await supabase.from(TBL_PROJETOS_DB).select("Nome_Projeto").order("Nome_Projeto").limit(50);
    return NextResponse.json((data || []).map((r) => ({ nome: r.Nome_Projeto })));
  }

  // Busca inteligente: cada palavra vira um wildcard separado
  // Ex: "cat 320" busca nomes que contêm "cat" E "320"
  const termos = termo.trim().split(/\s+/);
  let query = supabase.from(TBL_PROJETOS_DB).select("Nome_Projeto");

  for (const t of termos) {
    query = query.ilike("Nome_Projeto", `%${t}%`);
  }

  const { data } = await query.limit(100);
  return NextResponse.json((data || []).map((r) => ({ nome: r.Nome_Projeto })));
}
