import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// GET /api/publico/carrinho/:token  -> carrinho (campos públicos) + itens. Sem login.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { data: carrinho } = await supabase
      .from("carrinhos")
      .select("id, nome, cliente, modelo, modelo_slug, servico, status, expira_em")
      .eq("share_token", token)
      .maybeSingle();
    if (!carrinho) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
    const { data: itens } = await supabase
      .from("carrinho_itens").select("id, codigo, descricao, qtd")
      .eq("carrinho_id", carrinho.id).order("criado_em", { ascending: true });
    return NextResponse.json({ carrinho, itens: itens || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
