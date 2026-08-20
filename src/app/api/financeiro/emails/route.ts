// E-mails de cobrança:
//   GET ?chamadoId=123   → linha do tempo de e-mails do card
//   GET ?respostas=1     → últimas respostas de clientes (painel ao lado do sininho)
//   PATCH { ids: [...] } → marca respostas como lidas
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const chamadoId = req.nextUrl.searchParams.get("chamadoId");
  if (chamadoId) {
    const { data } = await supabase.from("financeiro_emails")
      .select("id, tipo, direcao, de_email, destinatarios, assunto, corpo, parcela_n, venc_ref, criado_em")
      .eq("chamado_id", Number(chamadoId))
      .order("criado_em", { ascending: true }).limit(100);
    return NextResponse.json({ emails: data || [] });
  }

  if (req.nextUrl.searchParams.get("respostas") === "1") {
    const { data } = await supabase.from("financeiro_emails")
      .select("id, chamado_id, de_email, assunto, corpo, lido_em, criado_em")
      .eq("tipo", "resposta")
      .order("criado_em", { ascending: false }).limit(50);
    const respostas = data || [];
    // Nome do cliente de cada card, pro painel
    const ids = [...new Set(respostas.map((r) => r.chamado_id))];
    let nomes: Record<number, string> = {};
    if (ids.length) {
      const { data: cards } = await supabase.from("Chamado_NF").select("id, nom_cliente").in("id", ids);
      nomes = Object.fromEntries((cards || []).map((c) => [c.id, c.nom_cliente || ""]));
    }
    return NextResponse.json({
      respostas: respostas.map((r) => ({ ...r, cliente: nomes[r.chamado_id] || "" })),
      naoLidas: respostas.filter((r) => !r.lido_em).length,
    });
  }

  return NextResponse.json({ error: "?chamadoId= ou ?respostas=1" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { ids } = await req.json().catch(() => ({ ids: [] }));
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true, marcadas: 0 });
  await supabase.from("financeiro_emails")
    .update({ lido_em: new Date().toISOString() })
    .in("id", ids.map(Number)).is("lido_em", null);
  return NextResponse.json({ ok: true, marcadas: ids.length });
}
