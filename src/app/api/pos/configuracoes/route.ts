import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { VALOR_HORA, VALOR_KM } from "@/lib/pos/constants";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { autenticar } from "@/lib/auth/server";

export async function GET(req: NextRequest) {
  // valor da hora/km: lido pelo POS, Mecânicos e outras telas → só login
  if (!(await autenticar(req))) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data } = await supabase
    .from("configuracoes_pos")
    .select("valor_hora, valor_km")
    .eq("id", 1)
    .single();

  return NextResponse.json({
    valor_hora: data?.valor_hora ?? VALOR_HORA,
    valor_km: data?.valor_km ?? VALOR_KM,
  });
}

export async function PUT(req: NextRequest) {
  // botão "Configurações" do cabeçalho do POS (aparece para todo mundo do POS)
  const g = await protegerRota(req, [{ modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  const { valor_hora, valor_km } = await req.json();

  if (typeof valor_hora !== "number" || typeof valor_km !== "number") {
    return NextResponse.json({ erro: "Valores inválidos" }, { status: 400 });
  }

  if (valor_hora <= 0 || valor_km <= 0) {
    return NextResponse.json({ erro: "Valores devem ser maiores que zero" }, { status: 400 });
  }

  const { error } = await supabase
    .from("configuracoes_pos")
    .update({ valor_hora, valor_km, atualizado_em: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ sucesso: true, valor_hora, valor_km });
}
