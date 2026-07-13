import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/clientes/vincular-pv
// Aponta MANUALMENTE qual Pedido de Venda (peça) pertence a uma OS da pasta.
// Serve quando o vínculo que veio do Omie (cNumPedCli) está errado ou vazio e, por isso,
// o sync busca a NF de peça no pedido errado. O valor fica em portal_nt_clientes_os.pv_manual
// e tem PRIORIDADE sobre o do Omie no sync-os. Mandar pv vazio ("") volta pro automático.
// Body: { num_os, empresa, pv, usuario? }
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);
const SISTEMA_UID = "00000000-0000-0000-0000-000000000000";

export async function POST(req: NextRequest) {
  try {
    const { num_os, empresa, pv, usuario, usuarioId } = await req.json();
    if (!num_os || !empresa) {
      return NextResponse.json({ error: "num_os e empresa são obrigatórios" }, { status: 400 });
    }
    const numOS = String(num_os);
    // só dígitos (o nº do pedido) — vazio = volta pro vínculo automático do Omie
    const pvNovo = String(pv ?? "").replace(/\D/g, "").trim();

    const { data: antes } = await supabase.from("portal_nt_clientes_os")
      .select("num_pedido_cli, pv_manual").eq("num_os", numOS).eq("empresa", empresa).maybeSingle();

    const { error } = await supabase.from("portal_nt_clientes_os")
      .update({ pv_manual: pvNovo || null }).eq("num_os", numOS).eq("empresa", empresa);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("audit_log").insert([{
      user_id: usuarioId || SISTEMA_UID,
      user_nome: usuario || "Pasta Cliente",
      sistema: "clientes",
      acao: "pv_vinculado",
      entidade: "OS",
      entidade_id: numOS,
      entidade_label: `OS ${numOS} (${empresa})`,
      detalhes: { de: antes?.pv_manual || antes?.num_pedido_cli || null, para: pvNovo || "(automático)" },
    }]).select("id").maybeSingle().then(() => {}, () => {}); // best-effort

    return NextResponse.json({ ok: true, num_os: numOS, pv: pvNovo || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
