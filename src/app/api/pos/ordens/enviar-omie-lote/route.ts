import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/auth/server";
import { enviarLoteOmie } from "@/lib/pos/atualizar-relatorio";

// Tratorilson — envia ao Omie todas as OS em "Enviar Omie" (OS + PPV). Só admin.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const r = await enviarLoteOmie(auth.email || "Tratorilson");
  return NextResponse.json(r);
}
