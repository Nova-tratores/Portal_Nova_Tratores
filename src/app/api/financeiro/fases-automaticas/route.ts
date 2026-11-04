// POST /api/financeiro/fases-automaticas → move os cards do Financeiro pelas regras de
// lib/financeiro/fases-automaticas.ts (confere o Omie antes; registra no histórico) e confere as
// contas a pagar das requisições com o Omie (lib/financeiro/pagar-omie.ts).
// Chamado pelos kanbans ao abrir — antes cada navegador fazia isso sozinho, sem conferir
// o Omie (29/10/2026). Só exige login: é o mesmo que acontecia ao abrir a tela.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { aplicarFasesAutomaticas } from "@/lib/financeiro/fases-automaticas";
import { aplicarPagarOmie } from "@/lib/financeiro/pagar-omie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// várias telas abertas ao mesmo tempo não precisam repetir a conferência
const g = globalThis as unknown as { __finFasesUltima?: number; __finFasesRodando?: Promise<unknown> };
const INTERVALO_MS = 60_000;

export async function POST(req: Request) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    if (g.__finFasesRodando) { await g.__finFasesRodando; return NextResponse.json({ ok: true, movidos: 0, recente: true }); }
    if (g.__finFasesUltima && Date.now() - g.__finFasesUltima < INTERVALO_MS) return NextResponse.json({ ok: true, movidos: 0, recente: true });
    const p = Promise.all([aplicarFasesAutomaticas(supabase), aplicarPagarOmie(supabase)]);
    g.__finFasesRodando = p;
    const r = await p.finally(() => { g.__finFasesRodando = undefined; g.__finFasesUltima = Date.now(); });
    const [fases, pagar] = r;
    return NextResponse.json({ ok: true, olhados: fases.olhados, movidos: fases.movidos.length, pagar: pagar.acoes.length, erros: [...fases.erros, ...pagar.erros] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[financeiro/fases-automaticas]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
