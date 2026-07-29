// Lista as semanas do relatório (sem ?semana) ou devolve os dados de uma semana
// específica (?semana=YYYY-MM-DD). Leitura da tabela clientes_relatorios_semanais.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(req: NextRequest) {
  const semana = req.nextUrl.searchParams.get("semana");
  try {
    if (semana) {
      const { data, error } = await supabase
        .from("clientes_relatorios_semanais")
        .select("semana, gerado_em, total_cards, total_valor, dados")
        .eq("semana", semana)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(data);
    }
    const { data, error } = await supabase
      .from("clientes_relatorios_semanais")
      .select("semana, gerado_em, total_cards, total_valor")
      .order("semana", { ascending: false })
      .limit(52);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
