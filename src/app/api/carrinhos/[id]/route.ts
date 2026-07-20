import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_PRODUTOS, TBL_PRODUTOS_MANUAIS } from "@/lib/ppv/constants";

// GET /api/carrinhos/:id  -> carrinho + itens + histórico
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { data: carrinho, error } = await supabase.from("carrinhos").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!carrinho) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
    const [{ data: itens }, { data: historico }] = await Promise.all([
      supabase.from("carrinho_itens").select("*").eq("carrinho_id", id).order("criado_em", { ascending: true }),
      supabase.from("carrinho_historico").select("*").eq("carrinho_id", id).order("quando", { ascending: false }),
    ]);

    // Marca quais itens já são cadastrados (Omie ou manual) — pra Fase 2.
    const codes = [...new Set((itens || []).map((i) => String(i.codigo || "").trim()).filter(Boolean))];
    const registrados = new Set<string>();
    if (codes.length) {
      const [{ data: c1 }, { data: c2 }] = await Promise.all([
        supabase.from(TBL_PRODUTOS).select("Codigo_Produto").in("Codigo_Produto", codes),
        supabase.from(TBL_PRODUTOS_MANUAIS).select("Prod_Codigo").in("Prod_Codigo", codes),
      ]);
      for (const r of c1 || []) registrados.add(String(r.Codigo_Produto).trim().toUpperCase());
      for (const r of c2 || []) registrados.add(String(r.Prod_Codigo).trim().toUpperCase());
    }
    const itensMarcados = (itens || []).map((i) => ({ ...i, cadastrado: registrados.has(String(i.codigo || "").trim().toUpperCase()) }));
    return NextResponse.json({ carrinho, itens: itensMarcados, historico: historico || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}

// PATCH /api/carrinhos/:id  { nome?, cliente?, modelo?, servico?, status?, quem? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = await req.json();
    const quem = b?.quem ? String(b.quem) : "—";
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    for (const k of ["nome", "cliente", "modelo", "modelo_slug", "servico", "status"]) {
      if (b[k] !== undefined) patch[k] = String(b[k]);
    }
    const { error } = await supabase.from("carrinhos").update(patch).eq("id", id);
    if (error) throw error;
    if (b.status) {
      const acao = b.status === "fechado" ? "fechar" : b.status === "lixeira" ? "excluir" : "reabrir";
      const detalhe = b.status === "lixeira" ? "Movido para a lixeira" : b.status === "aberto" ? "Reaberto" : "";
      await supabase.from("carrinho_historico").insert({ carrinho_id: id, quem, acao, detalhe });
    } else {
      await supabase.from("carrinho_historico").insert({ carrinho_id: id, quem, acao: "editar", detalhe: "Dados do carrinho atualizados" });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}

// DELETE /api/carrinhos/:id  (apaga o carrinho e seus itens/histórico via cascade)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { error } = await supabase.from("carrinhos").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
