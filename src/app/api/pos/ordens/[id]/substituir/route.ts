// Substituir a OS ou um pedido de venda que a OS tem no Omie (cancela o antigo).
//   GET  → { pode }  (a tela só mostra o atalho para quem pode)
//   POST { alvo: "os" | "pedido", ppvId?, modo: "duplicar" | "outro", numeroNovo?, motivo }
// Regras e segurança em src/lib/pos/substituir-omie.ts.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeSubstituirOmie } from "@/lib/pos/faturamento";
import { substituirOS, substituirPedido, type ModoSubstituir } from "@/lib/pos/substituir-omie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  return NextResponse.json({ pode: podeSubstituirOmie(auth) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeSubstituirOmie(auth)) return NextResponse.json({ error: 'Você não tem a permissão "Substituir OS / pedido no Omie". Peça a um Dev.' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const modo: ModoSubstituir = body.modo === "outro" ? "outro" : "duplicar";
  const opts = { modo, numeroNovo: String(body.numeroNovo || ""), motivo: String(body.motivo || ""), usuario: auth.email || "Portal" };
  try {
    const r = body.alvo === "pedido"
      ? await substituirPedido(id, String(body.ppvId || ""), opts)
      : await substituirOS(id, opts);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Erro na substituição." }, { status: 500 });
  }
}
