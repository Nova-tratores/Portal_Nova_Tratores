import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/auth/server";
import { montarAtualizacaoOS, aplicarNaOS } from "@/lib/pos/atualizar-relatorio";

// Tratorilson — atualizar uma OS a partir do relatório do técnico.
// GET  /api/pos/ordens/:id/atualizar-relatorio           → prévia (não grava)
// POST /api/pos/ordens/:id/atualizar-relatorio?aplicar=1 → grava a proposta na OS
// Só admin/dev.
async function processar(req: NextRequest, ctx: { params: Promise<{ id: string }> }, aplicar: boolean) {
  const auth = await exigirAdmin(req);
  if (!auth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await ctx.params;
  const proposta = await montarAtualizacaoOS(String(id), auth.email || "Tratorilson");
  if (!proposta.ok) return NextResponse.json({ ok: false, erro: proposta.erro, proposta }, { status: 200 });

  if (aplicar) {
    const r = await aplicarNaOS(proposta);
    return NextResponse.json({ ok: r.ok, aplicado: r.ok, erro: r.erro, valorTotal: r.valorTotal, proposta });
  }
  return NextResponse.json({ ok: true, aplicado: false, proposta });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return processar(req, ctx, false);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const aplicar = req.nextUrl.searchParams.get("aplicar") === "1";
  return processar(req, ctx, aplicar);
}
