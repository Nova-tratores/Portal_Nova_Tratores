import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/clientes/substituir-nf
// Registra que uma NF (de serviço ou de peça) foi SUBSTITUÍDA: guarda nº antigo -> novo
// no histórico da OS/PV da pasta + grava no audit_log (quem/quando). Não mexe na nota
// fiscal em si (isso é no Omie) — só registra a troca pra manter o rastro.
// Body: { tipo:"os"|"pv", num, empresa, nf_tipo:"servico"|"peca", num_antigo?, num_novo, usuario?, usuarioId? }
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);
const SISTEMA_UID = "00000000-0000-0000-0000-000000000000";

export async function POST(req: NextRequest) {
  try {
    const { tipo, num, empresa, nf_tipo, num_antigo, num_novo, usuario, usuarioId } = await req.json();
    if (!tipo || !num || !empresa || !nf_tipo || !num_novo) {
      return NextResponse.json({ error: "tipo, num, empresa, nf_tipo e num_novo são obrigatórios" }, { status: 400 });
    }
    const tabela = tipo === "pv" ? "portal_nt_clientes_pv" : "portal_nt_clientes_os";
    const idCol = tipo === "pv" ? "num_pedido" : "num_os";
    const numStr = String(num);

    const { data: row } = await supabase.from(tabela)
      .select("nf_substituicoes").eq(idCol, numStr).eq("empresa", empresa).maybeSingle();

    const lista = Array.isArray(row?.nf_substituicoes) ? row!.nf_substituicoes : [];
    const entrada = {
      nf_tipo,                                  // "servico" | "peca"
      num_antigo: num_antigo ? String(num_antigo) : null,
      num_novo: String(num_novo),
      por: usuario || "—",
      por_id: usuarioId || null,
      em: new Date().toISOString(),
    };
    lista.push(entrada);

    const { error } = await supabase.from(tabela)
      .update({ nf_substituicoes: lista }).eq(idCol, numStr).eq("empresa", empresa);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("audit_log").insert([{
      user_id: usuarioId || SISTEMA_UID,
      user_nome: usuario || "Pasta Cliente",
      sistema: "clientes",
      acao: "nf_substituida",
      entidade: tipo === "pv" ? "PV" : "OS",
      entidade_id: numStr,
      entidade_label: `${tipo === "pv" ? "PV" : "OS"} ${numStr} (${empresa})`,
      detalhes: entrada,
    }]).select("id").maybeSingle().then(() => {}, () => {}); // best-effort

    return NextResponse.json({ ok: true, nf_substituicoes: lista });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
