import { NextRequest, NextResponse } from "next/server";
import { aplicarMudancaFase } from "@/lib/pos/fase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const { status: newStatus, userName } = await req.json();

  const r = await aplicarMudancaFase(idOs, newStatus, userName || "Sistema", { notificar: true });

  if (!r.success) {
    return NextResponse.json({ success: false, erro: r.erro }, { status: 400 });
  }
  return NextResponse.json({ success: true, changed: r.changed });
}
