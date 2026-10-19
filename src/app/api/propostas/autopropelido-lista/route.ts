import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { protegerRota } from "@/lib/ajustes/permissao-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Lista do AutopropelidoEditModal (tela /propostas: temAcesso('propostas')).
export async function GET(req: Request) {
  const g = await protegerRota(req, [{ modulo: "propostas" }]);
  if (g.resposta) return g.resposta;
  try {
    const { data, error } = await supabase
      .from("cad_autopropelido")
      .select("*")
      .order("marca");
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
