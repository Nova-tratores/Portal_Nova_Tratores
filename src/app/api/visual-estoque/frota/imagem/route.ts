import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeFrota } from "@/lib/frota/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";

// Atualiza imagem_url de um veículo. Porta /api/frota-imagem.
// Aceita { id_placa | IdPlaca, imagem_url }.
export async function POST(req: NextRequest) {
  // Rodava sem autenticacao nenhuma (mutacoes incluidas). O patio agora e
  // do Frota: a tela de patio morreu; quem edita FIPE/dados agora e a Ficha do Veiculo (frota:veiculos:editar).
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'veiculos:editar')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });


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
