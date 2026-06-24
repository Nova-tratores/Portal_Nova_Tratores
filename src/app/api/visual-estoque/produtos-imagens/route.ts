import { NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

// Lista produtos que já têm imagem (para copiar de outro). Porta /api/produtos-imagens.
export async function GET() {
  try {
    const { data } = await supabaseVE
      .from("produtos")
      .select("codigo_produto, codigo, descricao, imagem_url")
      .not("imagem_url", "is", null)
      .order("descricao")
      .limit(200);
    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json([]);
  }
}
