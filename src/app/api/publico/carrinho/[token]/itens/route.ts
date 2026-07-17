import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Resolve o carrinho pelo token e garante que está aberto (editável).
async function resolver(token: string) {
  const { data } = await supabase.from("carrinhos").select("id, status").eq("share_token", token).maybeSingle();
  return data;
}

// POST /api/publico/carrinho/:token/itens  { codigo, descricao, qtd, quem }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const cart = await resolver(token);
    if (!cart) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    if (cart.status !== "aberto") return NextResponse.json({ error: "Carrinho fechado." }, { status: 403 });
    const b = await req.json();
    const codigo = String(b?.codigo || "").trim();
    const qtd = Math.max(1, parseInt(String(b?.qtd)) || 1);
    const quem = (b?.quem ? String(b.quem) : "").trim() || "Link público";
    if (!codigo) return NextResponse.json({ error: "codigo obrigatório" }, { status: 400 });

    const { data: existente } = await supabase.from("carrinho_itens").select("*").eq("carrinho_id", cart.id).eq("codigo", codigo).maybeSingle();
    if (existente) await supabase.from("carrinho_itens").update({ qtd: (existente.qtd || 0) + qtd }).eq("id", existente.id);
    else await supabase.from("carrinho_itens").insert({ carrinho_id: cart.id, codigo, descricao: String(b?.descricao || ""), qtd });
    await supabase.from("carrinho_historico").insert({ carrinho_id: cart.id, quem, acao: "add_item", detalhe: `${codigo} (via link)` });
    await supabase.from("carrinhos").update({ atualizado_em: new Date().toISOString() }).eq("id", cart.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}

// DELETE /api/publico/carrinho/:token/itens?itemId=&codigo=&quem=
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const cart = await resolver(token);
    if (!cart) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    if (cart.status !== "aberto") return NextResponse.json({ error: "Carrinho fechado." }, { status: 403 });
    const itemId = req.nextUrl.searchParams.get("itemId") || "";
    const codigo = req.nextUrl.searchParams.get("codigo") || "";
    const quem = (req.nextUrl.searchParams.get("quem") || "").trim() || "Link público";
    if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 });
    await supabase.from("carrinho_itens").delete().eq("id", itemId).eq("carrinho_id", cart.id);
    await supabase.from("carrinho_historico").insert({ carrinho_id: cart.id, quem, acao: "rem_item", detalhe: `${codigo} (via link)` });
    await supabase.from("carrinhos").update({ atualizado_em: new Date().toISOString() }).eq("id", cart.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
