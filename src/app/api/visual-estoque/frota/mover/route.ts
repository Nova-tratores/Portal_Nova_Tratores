import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeFrota } from "@/lib/frota/server";
import { supabaseVE } from "@/lib/visual-estoque/supabase";
import { FROTA_AMBIENTES } from "@/lib/visual-estoque/frota";

// Move um veículo entre ambientes (e opcionalmente redimensiona). Porta /api/frota-mover.
export async function POST(req: NextRequest) {
  // Rodava sem autenticacao nenhuma (mutacoes incluidas). O patio agora e
  // do Frota: leitura = frota:patio; escrita = frota:patio:editar.
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'patio:editar')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });


  try {
    const body = await req.json();
    const id = body.id_placa ?? body.IdPlaca ?? body.codigo_produto ?? body.id;
    const { ambiente, pos_x, pos_y, img_tamanho } = body;
    if (!id || !(FROTA_AMBIENTES as readonly string[]).includes(ambiente)) {
      return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
    }
    const patch: Record<string, unknown> = { ambiente };
    if (pos_x !== undefined) patch.pos_x = pos_x;
    if (pos_y !== undefined) patch.pos_y = pos_y;
    if (img_tamanho !== undefined) patch.img_tamanho = Math.max(30, Math.min(300, Number(img_tamanho)));

    const { error } = await supabaseVE.from("Placas").update(patch).eq("IdPlaca", id);
    if (error) throw error;
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
