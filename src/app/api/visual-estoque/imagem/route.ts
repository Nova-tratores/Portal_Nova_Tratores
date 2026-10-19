import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Grava a imagem_url de um produto. Porta /api/imagem.
// Só a tela Pátio (MenuImagem) chama: pode('consulta-estoque', 'patio').
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "patio" }]);
  if (g.resposta) return g.resposta;
  try {
    const { codigo_produto, imagem_url } = await req.json();
    if (!codigo_produto || !imagem_url) {
      return NextResponse.json({ erro: "codigo_produto e imagem_url são obrigatórios" }, { status: 400 });
    }
    const { error } = await supabaseVE
      .from("produtos")
      .update({ imagem_url })
      .eq("codigo_produto", codigo_produto);
    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
