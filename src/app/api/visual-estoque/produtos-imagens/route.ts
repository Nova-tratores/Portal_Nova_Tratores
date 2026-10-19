import { NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Lista produtos que já têm imagem (para copiar de outro). Porta /api/produtos-imagens.
// Só a tela Pátio (MenuImagem) chama: pode('consulta-estoque', 'patio').
export async function GET(req: Request) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "patio" }]);
  if (g.resposta) return g.resposta;
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
