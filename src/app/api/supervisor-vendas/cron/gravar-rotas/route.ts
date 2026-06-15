import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computarESalvarRota } from "@/lib/pos/rastreamento";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const CRON_SECRET = process.env.CRON_SECRET || "";
export const maxDuration = 300; // 5 min

// Grava a rota do dia anterior de cada carro do comercial vinculado.
// Acionado por GitHub Actions (madrugada). Pode receber ?data=YYYY-MM-DD pra reprocessar.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Por padrão, ontem (BRT). Aceita override por querystring.
  const dataParam = req.nextUrl.searchParams.get("data");
  const ref = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ontem = dataParam || ref.toISOString().split("T")[0];

  const { data: carros, error } = await supabase
    .from("comercial_veiculos")
    .select("placa, pessoa_nome")
    .eq("ativo", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resultados: { placa: string; pontos: number; km: number; erro?: string }[] = [];
  for (const c of carros || []) {
    try {
      const rota = await computarESalvarRota(supabase, c.placa, ontem);
      resultados.push({ placa: c.placa, pontos: rota.pontos.length, km: rota.km_total });
    } catch (e: any) {
      resultados.push({ placa: c.placa, pontos: 0, km: 0, erro: e.message });
    }
  }

  return NextResponse.json({ sucesso: true, data: ontem, total: resultados.length, resultados });
}
