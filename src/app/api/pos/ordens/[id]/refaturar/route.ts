// "Cancelar nota e refazer": cancela a NFS-e da OS no Omie (CancelarOS com a
// nota) e liga uma cópia nova da OS para faturar de novo. Ato fiscal real:
// permissão explícita pos:cancelar_faturamento (Dev ou quem um Dev marcou).
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeCancelarFaturamento } from "@/lib/pos/faturamento";
import { cancelarERefazerOS } from "@/lib/pos/refaturar";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeCancelarFaturamento(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Cancelar faturamento\". Peça a um Dev." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const usuario = auth.email || "Portal";
  try {
    const r = await cancelarERefazerOS(id, { motivo: String(body?.motivo || "") as "1" | "2" | "9", texto: String(body?.texto || ""), usuario });
    await logAndNotify({
      userName: usuario, sistema: "pos", acao: r.ok ? "cancelar_nota_refazer" : "cancelar_nota_refazer_falhou",
      entidade: "ordem_servico", entidadeId: id, entidadeLabel: `OS ${id}`,
      detalhes: { ...r, motivo: String(body?.motivo || ""), texto: String(body?.texto || "") },
      notifTitulo: r.ok ? `OS ${id}: nota cancelada` : `OS ${id}: cancelamento da nota falhou`,
      notifDescricao: r.ok ? `${usuario} cancelou a NFS-e ${r.nfse} (OS ${r.antiga}) e ligou a nova OS ${r.nova}` : String(r.erro || ""),
      notifLink: `/pos?id=${id}`,
    }).catch(() => {});
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Erro ao cancelar a nota." }, { status: 500 });
  }
}
