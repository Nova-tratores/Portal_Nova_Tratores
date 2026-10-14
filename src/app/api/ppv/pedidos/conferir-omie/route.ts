// Conferência PPV × Pedido de Venda do Omie antes de faturar o pedido sozinho (José, 14/10/2026).
// GET ?id=PPV-x → divergências (só leitura). POST { id } → deixa o Omie igual ao portal e confere de novo.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { conferirPPVPublico, alinharPPV } from "@/lib/ppv/conferencia-omie";
import { registrarLog } from "@/lib/ppv/queries";
import { nomearDivergencias } from "@/lib/omie/conferencia-nomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Informe o pedido." }, { status: 400 });
  try { const r = await conferirPPVPublico(id); await nomearDivergencias([r]).catch(() => {}); return NextResponse.json({ os: null, ppvs: [r] }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao conferir com o Omie." }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Informe o pedido." }, { status: 400 });
  try {
    const r = await alinharPPV(id);
    if (!r.erro) await registrarLog(id, "Pedido do Omie atualizado igual ao portal (conferência antes de faturar)", auth.email || "Portal").catch(() => {});
    await nomearDivergencias([r]).catch(() => {});
    return NextResponse.json({ os: null, ppvs: [r] });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao atualizar o Omie." }, { status: 500 }); }
}
