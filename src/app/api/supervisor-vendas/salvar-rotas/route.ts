import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computarESalvarRota } from "@/lib/pos/rastreamento";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Data de "ontem" no fuso de Brasília (YYYY-MM-DD)
function ontemBR(): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// Salva no banco (rotas_vendedor) a rota + paradas + km + tempo do dia anterior
// de TODOS os carros comerciais ativos. Roda 1x/dia via cron (madrugada).
// Aceita ?data=YYYY-MM-DD pra (re)processar um dia específico.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  const data = req.nextUrl.searchParams.get("data") || ontemBR();

  const { data: carros, error } = await supabase
    .from("comercial_veiculos")
    .select("placa")
    .eq("categoria", "comercial")
    .eq("ativo", true);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const salvas: Array<{ placa: string; km: number; paradas: number; dirigindo: number }> = [];
  const semDados: string[] = [];
  const erros: Array<{ placa: string; erro: string }> = [];

  // Sequencial pra respeitar o rate limit da Rota Exata
  for (const c of carros || []) {
    try {
      const rota = await computarESalvarRota(supabase, c.placa, data);
      if (rota.pontos.length > 0) {
        salvas.push({ placa: c.placa, km: rota.km_total, paradas: rota.paradas.length, dirigindo: rota.tempo_dirigindo_min });
      } else {
        semDados.push(c.placa);
      }
    } catch (e) {
      erros.push({ placa: c.placa, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    data,
    total: (carros || []).length,
    salvas: salvas.length,
    semDados: semDados.length,
    erros: erros.length,
    detalhe: { salvas, semDados, erros },
  });
}
