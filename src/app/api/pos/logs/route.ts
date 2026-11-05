import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LOGS_PPO } from "@/lib/pos/constants";

// linha do tempo do drawer da OS (POS)
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  const osId = req.nextUrl.searchParams.get("osId");
  if (!osId) return NextResponse.json([]);

  try {
    const { data, error } = await supabase
      .from(TBL_LOGS_PPO)
      .select("*")
      .eq("Id_ppo", osId)
      .order("id", { ascending: false });

    if (error) {
      console.error("Erro ao buscar logs:", error);
      return NextResponse.json([]);
    }

    return NextResponse.json(
      (data || []).map((log) => ({
        data: log.Data_Acao + " " + log.Hora_Acao,
        acao: log.acao,
        usuario: log.UsuEmail,
        extra: log.Dias_Na_Fase > 0 ? `Ficou ${log.Dias_Na_Fase} dias nesta fase.` : "",
      }))
    );
  } catch (err) {
    console.error("Erro inesperado ao buscar logs:", err);
    return NextResponse.json([]);
  }
}
