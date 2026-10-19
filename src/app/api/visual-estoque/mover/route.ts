import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Arrastar máquina / tamanho da imagem na tela Pátio: pode('consulta-estoque', 'patio').
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "patio" }]);
  if (g.resposta) return g.resposta;
  try {
    const { codigo_produto, ambiente, pos_x, pos_y, img_tamanho } = await req.json();
    if (!codigo_produto || !ambiente) {
      return NextResponse.json({ erro: "codigo_produto e ambiente são obrigatórios" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { ambiente, pos_x: pos_x ?? 0, pos_y: pos_y ?? 0 };
    if (img_tamanho != null) patch.img_tamanho = Math.max(30, Math.min(300, Number(img_tamanho)));

    const { error } = await supabaseVE
      .from("produtos")
      .update(patch)
      .eq("codigo_produto", codigo_produto);

    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
