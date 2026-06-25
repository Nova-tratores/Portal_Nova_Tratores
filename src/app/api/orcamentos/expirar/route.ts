import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET || "";

// Dias de tolerância APÓS a validade antes de expirar de vez. Nesse intervalo o
// criador ainda recebe o aviso "na cara" (OrcamentoVencidoAlerta) para decidir
// se foi aprovado. Passado isso sem decisão, o orçamento expira sozinho.
const DIAS_TOLERANCIA = 3;

// GET — expira automaticamente orçamentos ativos que passaram da validade + tolerância
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: ativos, error } = await supabase
    .from("orcamentos")
    .select("id, validade, created_at")
    .eq("status", "ativo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ativos || ativos.length === 0) {
    return NextResponse.json({ msg: "Nenhum orçamento ativo", total: 0, expirados: 0 });
  }

  const agora = Date.now();
  const vencidos = ativos.filter((o: any) => {
    const dias = (Number(o.validade) || 15) + DIAS_TOLERANCIA;
    const limite = new Date(o.created_at).getTime() + dias * 86400000;
    return limite <= agora;
  });

  if (vencidos.length === 0) {
    return NextResponse.json({ msg: "Nenhum vencido", total: ativos.length, expirados: 0 });
  }

  const ids = vencidos.map((o: any) => o.id);
  const { error: updErr } = await supabase
    .from("orcamentos")
    .update({ status: "expirado", updated_at: new Date().toISOString() })
    .in("id", ids);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ total: ativos.length, expirados: ids.length, ids });
}
