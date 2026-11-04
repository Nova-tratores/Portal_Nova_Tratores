// Cobrança por e-mail DEPOIS do vencimento (29/10/2026): D+1 e D+7 para título ATRASADO no
// contas_receber do Omie, só para card cujo boleto foi enviado por e-mail; mesma conversa e mesmo
// remetente do envio original; registra em financeiro_emails com tipo 'cobranca'.
// ENVIA E-MAIL A CLIENTES: só roda com FINANCEIRO_COBRANCA=on (senão responde pulado) e o
// agendamento (sql/financeiro-cobranca-vencido.sql) nasce DESLIGADO.
// Só aceita a senha dos agendamentos no HEADER (Bearer ou x-cron-secret); sem CRON_SECRET = 401.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ehChamadaInterna } from "@/lib/auth/chamada-interna";
import { rodarCobrancas } from "@/lib/financeiro/emails-vencimento-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false } },
);

/** Só o agendador: senha dos agendamentos no header (Bearer ou x-cron-secret). Sem CRON_SECRET = 401. */
const guardarCron = (req: Request) => ehChamadaInterna(req.headers);

export async function POST(req: NextRequest) {
  if (!guardarCron(req)) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  try {
    const r = await rodarCobrancas(supabase);
    if ("pulado" in r) return NextResponse.json({ ok: true, pulado: r.pulado });
    console.log("[cobranca-vencido]", JSON.stringify(r));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[cobranca-vencido]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
