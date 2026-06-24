import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

// Atualiza imagem_url de um veículo. Porta /api/frota-imagem.
// Aceita { id_placa | IdPlaca, imagem_url }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id_placa ?? body.IdPlaca ?? body.id;
    const imagem_url = body.imagem_url;
    if (!id || !imagem_url) return NextResponse.json({ erro: "id_placa e imagem_url são obrigatórios" }, { status: 400 });

    const { error } = await supabaseVE.from("Placas").update({ imagem_url }).eq("IdPlaca", id);
    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
