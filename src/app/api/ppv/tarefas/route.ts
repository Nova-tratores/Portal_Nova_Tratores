// Tarefas do PPV.
//   GET   ?id=<idPPV>                          -> { tarefas, pendentes }
//   POST  { id, atribuidoA, descricao, userName } -> cria a tarefa (+ notifica)
import { NextRequest, NextResponse } from "next/server";
import { criarTarefa, listarTarefas, contarPendentes } from "@/lib/ppv/tarefas";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    const [tarefas, pendentes] = await Promise.all([listarTarefas(id), contarPendentes(id)]);
    return NextResponse.json({ tarefas, pendentes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API tarefas GET] ${id}: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const body = await req.json();
    const id: string = body?.id;
    const atribuidoA: string = (body?.atribuidoA || "").trim();
    const descricao: string = (body?.descricao || "").trim();
    const userName: string = body?.userName || auth.email || "Sistema";
    if (!id || !atribuidoA || !descricao) {
      return NextResponse.json({ error: "id, atribuidoA e descrição são obrigatórios" }, { status: 400 });
    }
    const res = await criarTarefa(id, atribuidoA, userName, descricao);
    if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 400 });
    return NextResponse.json({ success: true, id: res.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API tarefas POST] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
