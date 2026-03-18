import { NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_TECNICOS } from "@/lib/pos/constants";

export async function GET() {
  const { data } = await supabase.from(TBL_TECNICOS).select("*");
  const nomes = (data || []).map((t) => t.UsuNome || "Técnico").sort();
  return NextResponse.json(nomes);
}
