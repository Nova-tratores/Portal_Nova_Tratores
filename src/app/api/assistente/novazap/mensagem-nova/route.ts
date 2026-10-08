// Tratorilson DESLIGADO no NovaZap (chave-geral do robô): o Rails do zap
// avisa aqui quando chega mensagem de cliente, e o portal joga no sino de
// quem recebe os avisos do Tratorilson (Devs + escolhidos no Admin).
// Sem IA, sem pergunta pra equipe — só "tem mensagem nova no NovaZap".
// Um aviso por conversa a cada 30 min (rajada de mensagens não vira spam).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { destinatariosTratorilson } from "@/lib/assistente/notificados";
import { urlConversa } from "@/lib/chatwoot/config";

export const dynamic = "force-dynamic";

const TOKEN_PADRAO = "tratorilson-nt-6049";
const JANELA_MS = 30 * 60_000;

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-tratorilson-token") || "";
  if (token !== (process.env.TRATORILSON_TOKEN || TOKEN_PADRAO)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const conversa = String(body?.conversa_id || "").replace(/\D/g, "");
  if (!conversa) return NextResponse.json({ erro: "conversa_id obrigatório" }, { status: 400 });

  const nome = String(body?.contato?.nome || "").trim().slice(0, 120);
  const telefone = String(body?.contato?.telefone || "").trim().slice(0, 30);
  const texto = String(body?.texto || "").replace(/\s+/g, " ").trim().slice(0, 160);
  // o Rails manda a URL da própria instalação; sem ela, monta pelas env do portal
  const link = String(body?.link || "").startsWith("http") ? String(body.link) : urlConversa(conversa);

  const cli = sb();
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const { data: recente } = await cli
    .from("portal_notificacoes")
    .select("id")
    .eq("tipo", "novazap")
    .eq("link", link)
    .gte("created_at", desde)
    .limit(1);
  if (recente?.length) return NextResponse.json({ ok: true, enviadas: 0, motivo: "já avisado nos últimos 30 min" });

  const ids = await destinatariosTratorilson();
  if (!ids.length) return NextResponse.json({ ok: true, enviadas: 0 });

  const quem = nome || telefone || "Cliente";
  const rows = ids.map((user_id) => ({
    user_id,
    tipo: "novazap",
    titulo: `Mensagem nova no NovaZap — ${quem}`,
    descricao: texto || "Tratorilson desligado: responda pelo NovaZap.",
    link,
    icone: "💬",
  }));
  const { error } = await cli.from("portal_notificacoes").insert(rows);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enviadas: rows.length });
}
