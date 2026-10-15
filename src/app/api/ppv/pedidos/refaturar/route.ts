// Corrigir a NF-e de peças (José, 15/10/2026). Ato fiscal real: permissão
// explícita pos:cancelar_faturamento (a mesma da nota de serviço).
//   POST { id, acao: "cancelar", motivo: "1"|"2"|"9", texto } → cancela o pedido faturado no Omie (NF-e, título, estoque)
//   POST { id, acao: "duplicar" }                              → pedido novo no Omie (reaproveita a cópia) e liga ao PPV
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeCancelarFaturamento } from "@/lib/pos/faturamento";
import { cancelarNotaPedido, duplicarPedidoCancelado } from "@/lib/ppv/refaturar-pedido";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeCancelarFaturamento(auth)) return NextResponse.json({ ok: false, erro: "Você não tem a permissão \"Cancelar faturamento\". Peça a um Dev." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, erro: "Informe o pedido." }, { status: 400 });
  const usuario = auth.email || "Portal";
  const acao = body?.acao === "duplicar" ? "duplicar" : "cancelar";
  try {
    const r = acao === "duplicar" ? await duplicarPedidoCancelado(id, usuario)
      : await cancelarNotaPedido(id, { motivo: String(body?.motivo || ""), texto: String(body?.texto || ""), usuario });
    await logAndNotify({
      userName: usuario, sistema: "ppv", acao: `${acao === "duplicar" ? "refazer_pedido_omie" : "cancelar_nfe"}${r.ok ? "" : "_falhou"}`,
      entidade: "pedido", entidadeId: id, entidadeLabel: `PPV ${id}`,
      detalhes: { ...r, motivo: body?.motivo, texto: body?.texto },
      notifTitulo: r.ok ? (acao === "duplicar" ? `${id}: pedido refeito no Omie` : `${id}: NF-e cancelada`) : `${id}: não concluiu`,
      notifDescricao: r.ok ? (acao === "duplicar" ? `${usuario} ligou o pedido novo ${r.novo} (o ${r.antigo} foi cancelado)` : `${usuario} cancelou a NF-e ${r.nf || ""} (pedido ${r.antigo})`) : String(r.erro || ""),
      notifLink: `/ppv?id=${id}`,
    }).catch(() => {});
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Erro." }, { status: 500 });
  }
}
