import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

// Arquiva/desarquiva um produto. Produtos arquivados somem do pátio/showroom
// (fetchAllProdutos filtra arquivado=false). Porta /api/produtos/arquivar.
export async function POST(req: NextRequest) {
  try {
    const { codigo_produto, arquivado } = await req.json();
    if (!codigo_produto) {
      return NextResponse.json({ erro: "codigo_produto é obrigatório" }, { status: 400 });
    }

    const { error } = await supabaseVE
      .from("produtos")
      .update({ arquivado: arquivado !== false })
      .eq("codigo_produto", codigo_produto);

    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
