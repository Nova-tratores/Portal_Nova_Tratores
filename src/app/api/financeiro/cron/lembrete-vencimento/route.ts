// Cron (agendador do portal 09/13/17h, rota-interna): antes de cada vencimento, se o boleto foi
// ENVIADO POR E-MAIL, reenvia os mesmos documentos num e-mail educado de lembrete, pelo e-mail de
// quem fez o envio original (mesma conversa). Idempotente: 1 lembrete por card+vencimento (venc_ref).
// Parcelado: lembra cada parcela não paga.
// 29/10/2026: janela "vence nos próximos 0–5 dias e ainda sem lembrete daquele vencimento" (antes só
// o dia exato hoje+5 — cron perdido = lembrete perdido) e pula o título que o contas_receber do Omie
// já dá como RECEBIDO. Regras em lib/financeiro/emails-vencimento.ts.
// Só aceita a senha dos agendamentos no HEADER (Bearer ou x-cron-secret); sem CRON_SECRET = 401.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ehChamadaInterna } from "@/lib/auth/chamada-interna";
import { rodarLembretes } from "@/lib/financeiro/emails-vencimento-server";

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
    const stats = await rodarLembretes(supabase);
    console.log("[lembrete-vencimento]", JSON.stringify(stats));
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[lembrete-vencimento]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
