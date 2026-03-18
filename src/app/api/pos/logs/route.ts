import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LOGS_PPO } from "@/lib/pos/constants";

export async function GET(req: NextRequest) {
  const osId = req.nextUrl.searchParams.get("osId");
  if (!osId) return NextResponse.json([]);

  const { data } = await supabase
    .from(TBL_LOGS_PPO)
    .select("*")
    .eq("Id_ppo", osId)
    .order("id", { ascending: false });

  return NextResponse.json(
    (data || []).map((log) => ({
      data: log.Data_Acao + " " + log.Hora_Acao,
      acao: log.acao,
      usuario: log.UsuEmail,
      extra: log.Dias_Na_Fase > 0 ? `Ficou ${log.Dias_Na_Fase} dias nesta fase.` : "",
    }))
  );
}
