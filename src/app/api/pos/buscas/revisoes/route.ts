import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_REV_PRONTAS } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo") || "";
  let query = supabase.from(TBL_REV_PRONTAS).select("IdRevisoes,DescricaoCompleta");

  if (termo.trim()) {
    query = query.ilike("DescricaoCompleta", `%${termo.trim().replace(/ /g, "%")}%`).limit(50);
  } else {
    query = query.order("IdRevisoes").limit(50);
  }

  const { data } = await query;
  return NextResponse.json((data || []).map((r) => ({ id: r.IdRevisoes, descricao: r.DescricaoCompleta })));
}
