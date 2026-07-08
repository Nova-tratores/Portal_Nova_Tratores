import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/auth/server";
import { processarLoteRelatorios } from "@/lib/pos/atualizar-relatorio";

// Tratorilson — processa EM LOTE (manual) todas as OS em "Relatório Concluído".
// A mesma lógica roda automaticamente no agendador (src/instrumentation.ts).
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const r = await processarLoteRelatorios(auth.email || "Tratorilson (lote)");
  return NextResponse.json(r);
}
