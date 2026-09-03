// O NovaZap chama aqui quando um ATENDENTE HUMANO responde uma conversa:
// os cards "precisa de atendimento humano" daquele telefone somem do kanban.
// Token de máquina (mesmo do novazap).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const TOKEN_PADRAO = "tratorilson-nt-6049";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-tratorilson-token") || "";
  if (token !== (process.env.TRATORILSON_TOKEN || TOKEN_PADRAO)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const digitos = String(body?.telefone || "").replace(/\D/g, "").slice(-10);
  if (digitos.length < 8) return NextResponse.json({ erro: "telefone inválido" }, { status: 400 });

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supa
    .from("tratorilson_solicitacoes")
    .update({ fase: "concluida", status: "atendida", atendida_por: "assumida no NovaZap", atendida_em: new Date().toISOString() })
    .eq("tipo", "humano")
    .neq("fase", "concluida")
    .ilike("contato_telefone", `%${digitos}%`);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
