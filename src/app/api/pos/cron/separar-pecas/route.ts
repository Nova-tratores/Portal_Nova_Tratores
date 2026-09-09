// Cron diário (15h BRT, GitHub Actions pos-separar-pecas.yml): manda o e-mail
// de SEPARAÇÃO de peças respondendo o e-mail de aprovação — véspera do serviço;
// sexta cobre sábado/domingo/segunda; domingo não envia.
import { NextRequest, NextResponse } from "next/server";
import { processarLembretes } from "@/lib/pos/emails-pecas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await processarLembretes();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
