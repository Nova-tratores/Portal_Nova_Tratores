import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_PROJETOS_DB } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";

  if (!termo.trim()) {
    const { data } = await supabase.from(TBL_PROJETOS_DB).select("nome").order("nome").limit(50);
    return NextResponse.json((data || []).map((r) => ({ nome: r.nome })));
  }

  const termos = termo.trim().split(/\s+/);
  let query = supabase.from(TBL_PROJETOS_DB).select("nome");

  for (const t of termos) {
    query = query.ilike("nome", `%${t}%`);
  }

  const { data } = await query.limit(100);
  return NextResponse.json((data || []).map((r) => ({ nome: r.nome })));
}
