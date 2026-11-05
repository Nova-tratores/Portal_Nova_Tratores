import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseFetch } from "@/lib/ppv/supabase";
import { TBL_LOGS } from "@/lib/ppv/constants";

// Histórico do pedido: janela e detalhe do PPV.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "ppv" }]);
  if (g.resposta) return g.resposta;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json([]);

  try {
    const logs = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_LOGS}?id_ppv=eq.${id}&order=id.desc`
    );
    return NextResponse.json(logs || []);
  } catch (e) {
    console.error("Erro logs:", e);
    return NextResponse.json([]);
  }
}
