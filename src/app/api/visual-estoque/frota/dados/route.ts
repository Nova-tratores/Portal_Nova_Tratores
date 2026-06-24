import { NextRequest, NextResponse } from "next/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

// Atualiza dados de um veículo. Porta /api/frota-dados. Só grava os campos
// presentes no corpo (update parcial), identificando por IdPlaca.
const CAMPOS = ["modelo", "ano", "hodometro", "valor_mercado", "data_valor", "ativo", "frota_tipo", "combustivel", "tem_seguro"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id_placa ?? body.IdPlaca ?? body.id;
    if (!id) return NextResponse.json({ erro: "id_placa é obrigatório" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    for (const c of CAMPOS) if (body[c] !== undefined) patch[c] = body[c];
    if (Object.keys(patch).length === 0) return NextResponse.json({ sucesso: true });

    const { error } = await supabaseVE.from("Placas").update(patch).eq("IdPlaca", id);
    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
