// Reenvia a NFS-e rejeitada (ReenviarOS do Omie) depois de corrigir o cadastro.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeFaturarOS, reenviarNfseOS } from "@/lib/pos/faturamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeFaturarOS(auth)) return NextResponse.json({ error: "Sem permissão para faturar OS." }, { status: 403 });
  const { id } = await params;
  try {
    const r = await reenviarNfseOS(id, auth);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, mensagem: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
