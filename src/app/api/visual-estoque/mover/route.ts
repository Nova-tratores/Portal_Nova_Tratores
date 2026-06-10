import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

export async function POST(req: NextRequest) {
  try {
    const { codigo_produto, ambiente, pos_x, pos_y } = await req.json();
    if (!codigo_produto || !ambiente) {
      return NextResponse.json({ erro: "codigo_produto e ambiente são obrigatórios" }, { status: 400 });
    }

    const { error } = await supabaseVE
      .from("produtos")
      .update({ ambiente, pos_x: pos_x ?? 0, pos_y: pos_y ?? 0 })
      .eq("codigo_produto", codigo_produto);

    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
