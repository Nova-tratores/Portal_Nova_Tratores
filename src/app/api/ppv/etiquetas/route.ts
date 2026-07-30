import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Busca de produtos pra ETIQUETAS de identificação (PPV): procura por código
// ou descrição em produtos_caracteristicas (sync de Ajustes — uma linha por
// conta Omie NOVA/CASTRO, com a locação #PRATELEIRA/#ANDAR/#CAIXA no JSON).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ itens: [] });
  // vírgula/parêntese quebram o filtro or= do PostgREST
  const seguro = q.replace(/[,()]/g, " ").trim();
  try {
    const { data, error } = await supabase
      .from("produtos_caracteristicas")
      .select("conta_omie, codigo, descricao, caracteristicas")
      .or(`codigo.ilike.%${seguro}%,descricao.ilike.%${seguro}%`)
      .order("descricao")
      .limit(120);
    if (error) throw error;
    return NextResponse.json({ itens: data || [] });
  } catch (e) {
    return NextResponse.json(
      { itens: [], error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
