import { NextRequest, NextResponse } from "next/server";
import { moverOSPorData } from "@/lib/pos/fase-auto-server";

// Transições automáticas de fase por data (agendador diário). A regra é a mesma da lista
// do POS (lib/pos/fase-auto.ts) e respeita quem mudou a fase na mão (José, 23/10/2026:
// "as ordens mudam de fase sozinhas").

export async function POST(req: NextRequest) {
  // Guard opcional: se CRON_SECRET estiver definido, exige o segredo.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }
  try {
    const { movidas, respeitadas } = await moverOSPorData();
    return NextResponse.json({ ok: true, movidas: movidas.length, respeitadas, detalhe: movidas });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
