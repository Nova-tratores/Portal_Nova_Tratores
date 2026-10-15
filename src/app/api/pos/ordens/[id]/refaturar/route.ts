// Cancelar a nota da OS e refazer (José, 14–15/10/2026). Ato fiscal real:
// permissão explícita pos:cancelar_faturamento (Dev ou quem um Dev marcou).
//   POST { acao: "cancelar", motivo: "1"|"2"|"9", texto } → cancela a NFS-e no sistema nacional
//   POST { acao: "duplicar_os" }                          → OS nova no Omie (reaproveita a cópia), cancela a antiga lá e liga ao portal
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeCancelarFaturamento } from "@/lib/pos/faturamento";
import { cancelarNotaOS, refazerOSNoOmie } from "@/lib/pos/refaturar";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeCancelarFaturamento(auth)) return NextResponse.json({ ok: false, erro: "Você não tem a permissão \"Cancelar faturamento\". Peça a um Dev." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const usuario = auth.email || "Portal";
  const acao = body?.acao === "duplicar_os" ? "duplicar_os" : "cancelar";
  try {
    const r = acao === "duplicar_os"
      ? await refazerOSNoOmie(id, usuario)
      : await cancelarNotaOS(id, { motivo: String(body?.motivo || "") as "1" | "2" | "9", texto: String(body?.texto || ""), usuario });
    await logAndNotify({
      userName: usuario, sistema: "pos", acao: `${acao === "duplicar_os" ? "refazer_os_omie" : "cancelar_nfse"}${r.ok ? "" : "_falhou"}`,
      entidade: "ordem_servico", entidadeId: id, entidadeLabel: `OS ${id}`,
      detalhes: { ...r, motivo: body?.motivo, texto: body?.texto },
      notifTitulo: r.ok ? (acao === "duplicar_os" ? `OS ${id}: refeita no Omie` : `OS ${id}: NFS-e cancelada`) : `OS ${id}: não concluiu`,
      notifDescricao: r.ok ? (acao === "duplicar_os" ? `${usuario} ligou a OS nova ${r.nova} (a ${r.antiga} foi cancelada no Omie)` : `${usuario} cancelou a NFS-e ${r.nfse} (OS ${r.antiga}) no sistema nacional`) : String(r.erro || ""),
      notifLink: `/pos?id=${id}`,
    }).catch(() => {});
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Erro." }, { status: 500 });
  }
}
