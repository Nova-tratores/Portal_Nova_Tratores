import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Características de um produto (localização/ajustes) — uma linha por empresa
// (NOVA/CASTRO). Lê a tabela produtos_caracteristicas populada pelo sync de Ajustes.
export async function GET(req: NextRequest) {
  const codigo = (req.nextUrl.searchParams.get("codigo") || "").trim();
  if (!codigo) return NextResponse.json({ itens: [] });
  try {
    const { data, error } = await supabase
      .from("produtos_caracteristicas")
      .select("conta_omie, codigo, descricao, caracteristicas")
      .eq("codigo", codigo);
    if (error) throw error;
    return NextResponse.json({ itens: data || [] });
  } catch (e) {
    return NextResponse.json({ itens: [], error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
