import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_PRODUTOS, TBL_PRODUTOS_MANUAIS } from "@/lib/ppv/constants";

// GET /api/carrinhos/:id  -> carrinho + itens + histórico
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // As três consultas são independentes: em paralelo em vez de esperar o
    // carrinho pra só então buscar itens/histórico.
    const [{ data: carrinho, error }, { data: itens }, { data: historico }] = await Promise.all([
      supabase.from("carrinhos").select("*").eq("id", id).maybeSingle(),
      supabase.from("carrinho_itens").select("*").eq("carrinho_id", id).order("criado_em", { ascending: true }),
      supabase.from("carrinho_historico").select("*").eq("carrinho_id", id).order("quando", { ascending: false }),
    ]);
    if (error) throw error;
    if (!carrinho) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

    // Marca quais itens já são cadastrados (Omie ou manual) — pra Fase 2.
    // O código do catálogo vem SEM o prefixo "RP-" (ex.: 000016299P04), mas no
    // Omie/Produtos ele está COM prefixo (RP-000016299P04). Testamos as duas
    // formas, senão peça cadastrada aparece como "não cadastrada".
    const variantes = (c: string) => {
      const base = c.trim().toUpperCase();
      const semRp = base.replace(/^RP-/, "");
      return [...new Set([base, semRp, `RP-${semRp}`])];
    };
    const codigosItem = [...new Set((itens || []).map((i) => String(i.codigo || "").trim()).filter(Boolean))];
    const codesBusca = [...new Set(codigosItem.flatMap((c) => variantes(c)))];
    const registrados = new Set<string>();
    if (codesBusca.length) {
      const [{ data: c1 }, { data: c2 }] = await Promise.all([
        supabase.from(TBL_PRODUTOS).select("Codigo_Produto").in("Codigo_Produto", codesBusca),
        supabase.from(TBL_PRODUTOS_MANUAIS).select("Prod_Codigo").in("Prod_Codigo", codesBusca),
      ]);
      for (const r of c1 || []) registrados.add(String(r.Codigo_Produto).trim().toUpperCase());
      for (const r of c2 || []) registrados.add(String(r.Prod_Codigo).trim().toUpperCase());
    }
    const estaCadastrado = (c: string) => variantes(c).some((v) => registrados.has(v));
    const itensMarcados = (itens || []).map((i) => ({ ...i, cadastrado: estaCadastrado(String(i.codigo || "")) }));

    // Marca do modelo: define pra qual catálogo externo (Zeitten) dá pra exportar.
    let marca: string | null = null;
    if (carrinho.modelo) {
      const { data: mod } = await supabase
        .from("catalogo_modelos").select("marca").eq("nome", carrinho.modelo).limit(1).maybeSingle();
      marca = mod?.marca || null;
    }
    return NextResponse.json({ carrinho: { ...carrinho, marca }, itens: itensMarcados, historico: historico || [] });
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
