import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/auth/server";
import { enviarOSaoOmie } from "@/lib/pos/atualizar-relatorio";

// Envia UMA OS ao Omie (OS + PPV vinculado) e move pra "Enviado Para Omie".
// Disparado pelo botão do card na fase "Enviar Omie" do Kanban. Só admin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const r = await enviarOSaoOmie(id, auth.email || "Portal");
  return NextResponse.json(r);
}
