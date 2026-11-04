// POST /api/financeiro/recobranca { id, mover_para_vencido? } → o Financeiro pede recobrança:
// grava o card (vencido, "Cobrar Cliente (Recobrança)", recombrancas_qtd+1) e cria um TICKET no
// bloco "Cobranças — Pós-Vendas" ou "Cobranças — Peças" para alguém do setor cobrar (29/10/2026).
// Antes cada tela fazia o update direto pelo navegador. Regras em lib/financeiro/recobranca*.ts.
// Quem pode: módulo financeiro (ou financeiro:*), função "Financeiro" ou admin/dev.
import { NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { ehFuncaoFinanceiro } from "@/lib/financeiro/recobranca";
import { ErroRecobranca, recobrarCard } from "@/lib/financeiro/recobranca-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// dois cliques seguidos no mesmo card não criam dois tickets
const g = globalThis as unknown as { __finRecobrando?: Set<number> };
const emAndamento = (g.__finRecobrando ??= new Set<number>());

export async function POST(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });

  const { data: usu } = await supabaseAdmin.from("financeiro_usu").select("nome, funcao").eq("id", auth.userId).maybeSingle();
  const temModulo = auth.modulos.includes("financeiro") || auth.modulos.some((m) => m.startsWith("financeiro:"));
  if (!auth.isAdmin && !temModulo && !ehFuncaoFinanceiro(usu?.funcao)) {
    return NextResponse.json({ ok: false, error: "Sem permissão para pedir recobrança" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "id do card inválido" }, { status: 400 });
  if (emAndamento.has(id)) return NextResponse.json({ ok: false, error: "Esta recobrança já está sendo feita — aguarde." }, { status: 409 });

  emAndamento.add(id);
  try {
    const nome = String(usu?.nome || "").trim() || auth.email || "Financeiro";
    const r = await recobrarCard(id, { id: auth.userId, nome }, { moverParaVencido: body?.mover_para_vencido !== false });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErroRecobranca) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[financeiro/recobranca]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    emAndamento.delete(id);
  }
}
