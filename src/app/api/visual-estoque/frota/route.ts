import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeFrota } from "@/lib/frota/server";
import { buscarFrota } from "@/lib/visual-estoque/frota";

export async function GET(req: NextRequest) {
  // Rodava sem autenticacao nenhuma (mutacoes incluidas). O patio agora e
  // do Frota: leitura = frota:patio; escrita = frota:patio:editar.
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'patio')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });


  try {
    return NextResponse.json(await buscarFrota());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
