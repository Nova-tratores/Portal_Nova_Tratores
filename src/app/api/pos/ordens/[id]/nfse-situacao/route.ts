// Situação das NFS-e da OS direto no sistema nacional (José, 15/10/2026): a nota
// atual (chave pelo StatusOS do Omie) e as canceladas do histórico. Só leitura.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS } from "@/lib/pos/constants";
import { contaOmie } from "@/lib/omie/contas";
import { omie as omiePorta } from "@/lib/omie/porta";
import { consultarSituacaoNacional } from "@/lib/nfse/nacional";
import { temModuloPOS } from "../faturar/comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id } = await params;
  const { data } = await supabase.from(TBL_OS).select("omie_ncodos, nfse_numero, faturamento_status, faturamento_anterior").eq("Id_Ordem", id).limit(1);
  const os = data?.[0] as Record<string, unknown> | undefined;
  if (!os) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
  const notas: { nfse: string; chave: string; atual: boolean }[] = [];
  for (const a of (Array.isArray(os.faturamento_anterior) ? os.faturamento_anterior : []) as Record<string, unknown>[]) {
    if (a.chave) notas.push({ nfse: String(a.nfse || ""), chave: String(a.chave), atual: false });
  }
  if (os.nfse_numero && os.omie_ncodos && os.faturamento_status !== "nfse_cancelada") {
    try {
      const { key, secret } = contaOmie("Nova Tratores");
      const st = await omiePorta<{ ListaRpsNfse?: { cCodVerif?: string; nNfse?: string }[] }>({ appKey: key, appSecret: secret, rotulo: "Nova Tratores" }, "/servicos/os/", "StatusOS", { nCodOS: Number(os.omie_ncodos) }, { prioridade: "pessoa" });
      const r = (st.ListaRpsNfse || []).find((x) => /^\d{50}$/.test(String(x.cCodVerif || "")));
      if (r) notas.push({ nfse: String(r.nNfse || os.nfse_numero).replace(/^0+(?=\d)/, ""), chave: String(r.cCodVerif), atual: true });
    } catch { /* sem a atual */ }
  }
  const vistos = new Set<string>();
  const out = [];
  for (const n of notas) {
    if (vistos.has(n.chave)) continue;
    vistos.add(n.chave);
    out.push({ ...n, ...(await consultarSituacaoNacional(n.chave)), conferidoEm: new Date().toISOString() });
  }
  return NextResponse.json({ notas: out });
}
