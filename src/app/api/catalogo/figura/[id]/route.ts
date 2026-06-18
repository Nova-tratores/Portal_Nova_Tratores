import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Detalhe da figura: imagem + hotspots + peças (ordenadas pelo Ref numérico)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: fig, error } = await supabase
    .from("catalogo_figuras")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fig) return NextResponse.json({ error: "figura não encontrada" }, { status: 404 });

  const { data: pecas } = await supabase
    .from("catalogo_pecas")
    .select("id, code, name, reference, qtd, unit, compravel")
    .eq("figura_id", id);

  const ordenadas = (pecas || []).sort((a, b) => {
    const na = parseInt(String(a.reference || "0"), 10) || 0;
    const nb = parseInt(String(b.reference || "0"), 10) || 0;
    return na - nb;
  });

  return NextResponse.json({ ...fig, pecas: ordenadas });
}
