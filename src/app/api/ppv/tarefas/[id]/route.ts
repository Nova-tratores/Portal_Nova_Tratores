// Ações numa tarefa do PPV.
//   PATCH { acao: "visto" | "remarcar" | "concluir", lembrarEm?, userName }
import { NextRequest, NextResponse } from "next/server";
import { marcarVisto, remarcar, concluir } from "@/lib/ppv/tarefas";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const idTarefa = Number(id);
  if (!idTarefa) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  try {
    const body = await req.json();
    const acao: string = body?.acao;
    const userName: string = body?.userName || auth.email || "Sistema";
    if (acao === "visto") {
      await marcarVisto(idTarefa, userName);
    } else if (acao === "remarcar") {
      const lembrarEm: string = body?.lembrarEm;
      if (!lembrarEm) return NextResponse.json({ error: "lembrarEm obrigatório" }, { status: 400 });
      const r = await remarcar(idTarefa, lembrarEm, userName);
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    } else if (acao === "concluir") {
      const r = await concluir(idTarefa, userName);
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    } else {
      return NextResponse.json({ error: "ação inválida" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API tarefas PATCH] ${idTarefa}: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
