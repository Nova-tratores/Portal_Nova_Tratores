import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";

export async function GET(request: NextRequest) {
  // sem chamador no portal hoje (a tela abre o pdf_url direto); mesmo gate da tela /revisoes
  const g = await protegerRota(request, [{ modulo: "revisoes" }]);
  if (g.resposta) return g.resposta;

  const { searchParams } = request.nextUrl;
  const part = searchParams.get("part");

  if (!part) {
    return NextResponse.json(
      { error: "Parâmetro part (URL do PDF) é obrigatório." },
      { status: 400 }
    );
  }

  return NextResponse.redirect(part);
}
