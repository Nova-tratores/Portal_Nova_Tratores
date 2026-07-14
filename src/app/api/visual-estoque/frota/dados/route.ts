import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeFrota } from "@/lib/frota/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

// Atualiza dados de um veículo. Porta /api/frota-dados. Só grava os campos
// presentes no corpo (update parcial), identificando por IdPlaca.
const CAMPOS = ["modelo", "ano", "hodometro", "valor_mercado", "data_valor", "ativo", "frota_tipo", "combustivel", "tem_seguro"] as const;

export async function POST(req: NextRequest) {
  // Rodava sem autenticacao nenhuma (mutacoes incluidas). O patio agora e
  // do Frota: leitura = frota:patio; escrita = frota:patio:editar.
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'patio:editar')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });


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
