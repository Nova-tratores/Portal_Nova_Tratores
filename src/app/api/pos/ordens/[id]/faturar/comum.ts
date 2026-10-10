// Gate e tratamento de erro comuns das rotas de faturamento da OS.
import { NextRequest, NextResponse } from "next/server";
import { autenticar, type Autenticado } from "@/lib/auth/server";
import { MigracaoFaltando, faturamentoHabilitado, podeFaturarOS } from "@/lib/pos/faturamento";

export function temModuloPOS(auth: Autenticado): boolean {
  return auth.isAdmin || auth.modulos.includes("pos") || auth.modulos.some((m) => m.startsWith("pos:"));
}

/** exigeFaturar: além do login no POS, precisa do interruptor ligado e da permissão explícita pos:faturar. */
export async function gate(req: NextRequest, exigeFaturar: boolean): Promise<Autenticado | NextResponse> {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (exigeFaturar) {
    if (!faturamentoHabilitado(auth)) return NextResponse.json({ error: "O faturamento de OS pelo portal ainda não está ligado." }, { status: 503 });
    if (!podeFaturarOS(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Faturar OS\". Peça ao administrador." }, { status: 403 });
  }
  return auth;
}

export function erroRota(e: unknown, onde: string): NextResponse {
  if (e instanceof MigracaoFaltando) return NextResponse.json({ error: e.message, migracaoFaltando: true }, { status: 503 });
  const msg = e instanceof Error ? e.message : "Erro interno";
  console.error(`[API pos/faturar ${onde}]`, msg);
  return NextResponse.json({ error: msg }, { status: 500 });
}
