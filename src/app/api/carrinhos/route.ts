import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// GET /api/carrinhos?status=aberto|fechado  -> lista com contagem de itens
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || "aberto";
  try {
    const { data: brutos, error } = await supabase
      .from("carrinhos")
      .select("*")
      .eq("status", status)
      .order("atualizado_em", { ascending: false });
    if (error) throw error;

    // Rede de segurança pros expirados (7 dias). Antes isso era um UPDATE antes
    // de TODA listagem — uma escrita a cada leitura, mesmo sem nada a fechar.
    // Agora só grava quando realmente existe carrinho vencido (o cron diário é
    // quem normalmente faz esse trabalho).
    let carrinhos = brutos || [];
    if (status === "aberto") {
      const agora = new Date().toISOString();
      const vencidos = carrinhos.filter((c) => c.expira_em && c.expira_em < agora).map((c) => c.id);
      if (vencidos.length) {
        await supabase.from("carrinhos").update({ status: "fechado", atualizado_em: agora }).in("id", vencidos);
        carrinhos = carrinhos.filter((c) => !vencidos.includes(c.id));
      }
    }

    const ids = (carrinhos || []).map((c) => c.id);
    const contagem: Record<string, number> = {};
    if (ids.length) {
      const { data: itens } = await supabase.from("carrinho_itens").select("carrinho_id, qtd").in("carrinho_id", ids);
      for (const it of itens || []) contagem[it.carrinho_id] = (contagem[it.carrinho_id] || 0) + (it.qtd || 0);
    }
    return NextResponse.json((carrinhos || []).map((c) => ({ ...c, total_itens: contagem[c.id] || 0 })));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}

// POST /api/carrinhos  { nome, cliente, modelo, modelo_slug, servico, criadoPor, itens: [{codigo, descricao, qtd, cadastrado}] }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const criadoPor = b?.criadoPor ? String(b.criadoPor) : null;
    const { data: cart, error } = await supabase
      .from("carrinhos")
      .insert({
        nome: String(b?.nome || "").trim() || "Carrinho",
        cliente: String(b?.cliente || ""),
        modelo: String(b?.modelo || ""),
        modelo_slug: String(b?.modelo_slug || ""),
        servico: String(b?.servico || ""),
        criado_por: criadoPor,
      })
      .select("*")
      .single();
    if (error) throw error;

    const itens = Array.isArray(b?.itens) ? b.itens : [];
    if (itens.length) {
      await supabase.from("carrinho_itens").insert(
        itens.map((it: { codigo?: string; descricao?: string; qtd?: number; cadastrado?: boolean }) => ({
          carrinho_id: cart.id,
          codigo: String(it.codigo || "").trim(),
          descricao: String(it.descricao || ""),
          qtd: Math.max(1, parseInt(String(it.qtd)) || 1),
          cadastrado: !!it.cadastrado,
        }))
      );
    }
    await supabase.from("carrinho_historico").insert({
      carrinho_id: cart.id, quem: criadoPor || "—", acao: "criar",
      detalhe: `Carrinho criado${itens.length ? ` com ${itens.length} item(ns)` : ""}`,
    });
    return NextResponse.json({ ok: true, id: cart.id, carrinho: cart });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
