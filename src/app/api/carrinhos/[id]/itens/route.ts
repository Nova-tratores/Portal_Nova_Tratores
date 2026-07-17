import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

async function toca(id: string) {
  await supabase.from("carrinhos").update({ atualizado_em: new Date().toISOString() }).eq("id", id);
}

// POST /api/carrinhos/:id/itens  { codigo, descricao, qtd, cadastrado, quem }
// Se o código já existe no carrinho, soma a quantidade.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = await req.json();
    const codigo = String(b?.codigo || "").trim();
    const qtd = Math.max(1, parseInt(String(b?.qtd)) || 1);
    const quem = b?.quem ? String(b.quem) : "—";
    if (!codigo) return NextResponse.json({ error: "codigo obrigatório" }, { status: 400 });

    const { data: existente } = await supabase.from("carrinho_itens").select("*").eq("carrinho_id", id).eq("codigo", codigo).maybeSingle();
    if (existente) {
      await supabase.from("carrinho_itens").update({ qtd: (existente.qtd || 0) + qtd }).eq("id", existente.id);
    } else {
      await supabase.from("carrinho_itens").insert({ carrinho_id: id, codigo, descricao: String(b?.descricao || ""), qtd, cadastrado: !!b?.cadastrado });
    }
    await supabase.from("carrinho_historico").insert({ carrinho_id: id, quem, acao: "add_item", detalhe: `${codigo}${qtd > 1 ? ` (${qtd}x)` : ""}` });
    await toca(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}

// PATCH /api/carrinhos/:id/itens  { itemId, qtd, quem }  (altera quantidade)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = await req.json();
    const itemId = String(b?.itemId || "");
    const qtd = Math.max(1, parseInt(String(b?.qtd)) || 1);
    if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 });
    await supabase.from("carrinho_itens").update({ qtd }).eq("id", itemId).eq("carrinho_id", id);
    await toca(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}

// DELETE /api/carrinhos/:id/itens?itemId=...&codigo=...&quem=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const itemId = req.nextUrl.searchParams.get("itemId") || "";
    const codigo = req.nextUrl.searchParams.get("codigo") || "";
    const quem = req.nextUrl.searchParams.get("quem") || "—";
    if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 });
    await supabase.from("carrinho_itens").delete().eq("id", itemId).eq("carrinho_id", id);
    await supabase.from("carrinho_historico").insert({ carrinho_id: id, quem, acao: "rem_item", detalhe: codigo });
    await toca(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
