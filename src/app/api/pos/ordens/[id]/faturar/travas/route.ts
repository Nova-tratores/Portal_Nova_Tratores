// Travas antes de faturar a OS (José, 22/10/2026): previsão de faturamento = hoje, projeto preenchido e
// localização do cliente confirmada. A janela de faturar consulta aqui depois do clique; o POST de faturar
// recusa (409) sem elas. Regras em lib/pos/travas-faturar.ts.
import { NextRequest, NextResponse } from "next/server";
import { travasDaOS } from "@/lib/pos/faturamento";
import { temModuloPOS, erroRota } from "../comum";
import { autenticar } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  try {
    const r = await travasDaOS(id);
    if (!r) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
    return NextResponse.json({ ...r, ok: r.travas.every((t) => t.ok) });
  } catch (e) { return erroRota(e, "travas"); }
}
