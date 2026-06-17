import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Cria de verdade o documento PROPOSTO pelo Tratorilson (após o usuário confirmar no botão).
// body: { proposta: { tipo, ... }, userName }
export async function POST(req: NextRequest) {
  try {
    const { proposta, userName } = await req.json();
    if (!proposta?.tipo) return NextResponse.json({ error: "Proposta inválida." }, { status: 400 });
    const origin = req.nextUrl.origin;
    const quem = userName || "Tratorilson";

    // Orçamento e PPV reutilizam o endpoint do carrinho do catálogo
    if (proposta.tipo === "orcamento" || proposta.tipo === "ppv") {
      const r = await fetch(`${origin}/api/catalogo/criar-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: proposta.tipo,
          items: (proposta.itens || []).map((i: any) => ({ codigo: i.codigo, descricao: i.descricao, quantidade: i.quantidade })),
          cliente: proposta.cliente,
          userName: quem,
        }),
      });
      const j = await r.json();
      if (!r.ok) return NextResponse.json({ error: j.error || "Erro ao criar." }, { status: 500 });
      const abrirUrl = proposta.tipo === "ppv" ? `/ppv?id=${encodeURIComponent(j.id || "")}` : "/orcamentos";
      return NextResponse.json({ ok: true, tipo: proposta.tipo, id: j.id, numero: j.numero || j.id, abrirUrl });
    }

    // OS (POS)
    if (proposta.tipo === "os") {
      const r = await fetch(`${origin}/api/pos/ordens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proposta.dados, userName: quem }),
      });
      const j = await r.json();
      if (!j?.success) return NextResponse.json({ error: j?.erro || "Erro ao criar OS." }, { status: 500 });
      const id = j.novaOsId;
      return NextResponse.json({ ok: true, tipo: "os", id, numero: id, abrirUrl: `/pos?id=${encodeURIComponent(id)}` });
    }

    // Requisição
    if (proposta.tipo === "requisicao") {
      const { data, error } = await supabase.from("Requisicao").insert([{ ...proposta.dados, criado_por: quem }]).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, tipo: "requisicao", id: data.id, numero: data.id, abrirUrl: `/requisicoes/imprimir/${data.id}` });
    }

    return NextResponse.json({ error: "Tipo não suportado." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
