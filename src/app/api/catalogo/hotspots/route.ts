import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Guarda as posições das bolinhas de uma figura (modo edição do catálogo, só Ventura por agora).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Editar o catálogo (ordem dos modelos / bolinhas) acontece onde o CatalogoNovo
// abre logado: aba Catálogo e busca de produto do /ppv, editor do /orcamentos e
// busca de produto da OS (/pos). O link público /carrinho/[token] não edita.
const ACESSO_EDITAR = [{ modulo: "ppv" }, { modulo: "orcamentos" }, { modulo: "pos" }];

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO_EDITAR);
  if (g.resposta) return g.resposta;
  try {
    const { figuraId, hotspots } = await req.json();
    if (!figuraId || !Array.isArray(hotspots)) {
      return NextResponse.json({ error: "figuraId e hotspots são obrigatórios" }, { status: 400 });
    }
    // Sanitiza: só reference (string) + x,y numéricos inteiros
    const limpos = hotspots
      .filter((h) => h && h.reference != null && Number.isFinite(+h.x) && Number.isFinite(+h.y))
      .map((h) => ({ reference: String(h.reference), x: Math.round(+h.x), y: Math.round(+h.y) }));

    const { error } = await supabase
      .from("catalogo_figuras")
      .update({ hotspots: limpos })
      .eq("id", figuraId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, total: limpos.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
