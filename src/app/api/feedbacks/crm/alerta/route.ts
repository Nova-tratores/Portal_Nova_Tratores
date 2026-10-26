import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { permite } from "@/lib/permissoes/explicitas";
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { ehPosVendas } from "@/lib/assistente/notificados";
import { filtrarDestinatarios } from "@/lib/notif/prefs";
import { precisaAlerta } from "@/lib/feedbacks/fila";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";
import { descricaoAlertaCrm, cortarTexto } from "@/lib/feedbacks/crm-automatico";

export const dynamic = "force-dynamic";

// Cliente insatisfeito (nota ≤ 6 ou "Insatisfeito") no CRM → aviso no sino dos gerentes
// do pós-vendas (categoria "Pós Vendas" ou módulo `pos`) e dos admins, ativos, que não
// silenciaram "Feedbacks & CRM". A tela chama depois de salvar a ligação; repetir a
// chamada em 24 h não avisa de novo (confere portal_notificacoes pelo link).
const JANELA_REPETIDO_MS = 24 * 3600_000;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!permite(auth.modulos, auth.isAdmin, "feedbacks", undefined, auth.isDev)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const { data: r, error } = await sb.from("feedback_registros")
    .select("id, tipo, nome, nota, status_cliente, tecnico, feedback").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!r) return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  if (!precisaAlerta(r as Pick<FeedbackRegistro, "nota" | "status_cliente">)) {
    return NextResponse.json({ ok: true, avisados: 0, motivo: "sem_alerta" });
  }

  const link = `/feedbacks?motivo=pos&id=${id}`;
  const desde = new Date(Date.now() - JANELA_REPETIDO_MS).toISOString();
  const { data: ja } = await sb.from("portal_notificacoes").select("id").eq("link", link).gte("created_at", desde).limit(1);
  if (ja && ja.length) return NextResponse.json({ ok: true, avisados: 0, motivo: "ja_avisado_24h" });

  const [{ data: perms, error: e1 }, { data: ativos, error: e2 }] = await Promise.all([
    sb.from("portal_permissoes").select("user_id, is_admin, is_dev, categoria, modulos_permitidos, notif_silenciado"),
    sb.from("financeiro_usu").select("id").eq("ativo", true),
  ]);
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 });
  const ativosSet = new Set((ativos || []).map((u) => String(u.id)));
  const candidatos = (perms || [])
    .filter((p) => ativosSet.has(String(p.user_id)))
    .filter((p) => p.is_admin === true || p.is_dev === true
      || ehPosVendas({ categoria: p.categoria, modulos: Array.isArray(p.modulos_permitidos) ? p.modulos_permitidos : [] }))
    .map((p) => ({ user_id: String(p.user_id), categoria: p.categoria, notif_silenciado: Array.isArray(p.notif_silenciado) ? p.notif_silenciado : [] }));
  const destinatarios = filtrarDestinatarios("feedbacks", candidatos);
  if (!destinatarios.length) return NextResponse.json({ ok: true, avisados: 0, motivo: "sem_destinatarios" });

  const titulo = cortarTexto(`Cliente insatisfeito: ${r.nome || "cliente"}`, 120);
  const descricao = descricaoAlertaCrm(r as FeedbackRegistro);
  const { error: e3 } = await sb.from("portal_notificacoes").insert(
    destinatarios.map((user_id) => ({ user_id, tipo: "sistema", titulo, descricao, link })),
  );
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  return NextResponse.json({ ok: true, avisados: destinatarios.length });
}
