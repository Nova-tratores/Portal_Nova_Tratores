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

  // A tabela tem linhas duplicadas (vindas de importações repetidas): o mesmo
  // código aparece várias vezes com a mesma referência, e ainda uma versão com
  // referência vazia. Deduplica por (referência + código), preferindo a linha
  // que tem quantidade preenchida, e descarta a versão "sem referência" quando
  // o mesmo código já tem uma referência real no desenho.
  const norm = (v: unknown) => String(v ?? "").trim();
  const melhor = new Map<string, NonNullable<typeof pecas>[number]>();
  for (const p of pecas || []) {
    const key = `${norm(p.reference)}||${norm(p.code)}`;
    const atual = melhor.get(key);
    if (!atual || (p.qtd != null && atual.qtd == null)) melhor.set(key, p);
  }
  let unicas = [...melhor.values()];
  const codigosComRef = new Set(
    unicas.filter((p) => norm(p.reference) !== "").map((p) => norm(p.code))
  );
  unicas = unicas.filter((p) => !(norm(p.reference) === "" && codigosComRef.has(norm(p.code))));

  const ordenadas = unicas.sort((a, b) => {
    const na = parseInt(String(a.reference || "0"), 10) || 0;
    const nb = parseInt(String(b.reference || "0"), 10) || 0;
    return na - nb;
  });

  return NextResponse.json({ ...fig, pecas: ordenadas });
}
