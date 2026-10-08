// Perguntas do Tratorilson pra equipe — quando ele NÃO SABE lidar com uma
// situação nova no WhatsApp, cria uma pergunta (rota /api/assistente/novazap).
// GET lista (e diz se o chamador recebe o alerta central: Devs + escolhidos no Admin);
// POST responde (o PRIMEIRO que responder vence, e a resposta vira REGRA na
// memória dele); PATCH fecha sem responder (descartar).
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { gravarRegra } from "@/lib/assistente/memoria";
import { retornarAoCliente } from "@/lib/assistente/retorno-cliente";
import { souNotificadoTratorilson } from "@/lib/assistente/notificados";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const [{ data: perguntas, error }, souNotificado] = await Promise.all([
      sb().from("tratorilson_perguntas").select("*").order("criado_em", { ascending: false }).limit(40),
      souNotificadoTratorilson(auth),
    ]);
    if (error) throw error;
    const abertas = (perguntas || []).filter((p) => p.status === "aberta").length;
    return NextResponse.json(
      { perguntas: perguntas || [], abertas, souNotificado },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ perguntas: [], abertas: 0, souNotificado: false, aviso: "rode sql/tratorilson-perguntas.sql" });
  }
}

// Responder: primeiro que chegar vence (update condicionado a status='aberta').
export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const resposta = String(body?.resposta || "").trim().slice(0, 1500);
  if (!id || !resposta) return NextResponse.json({ error: "id e resposta obrigatórios" }, { status: 400 });

  const quem = auth.email || auth.userId;
  // depois=true: ensinar AGORA uma pergunta que alguém tinha fechado sem responder
  // (aba "Dispensadas sem atualizar"). O cliente já foi atendido: não manda retorno.
  const depois = body?.depois === true;
  const { data, error } = await sb()
    .from("tratorilson_perguntas")
    .update({ status: "respondida", resposta, respondido_por: quem, respondido_em: new Date().toISOString() })
    .eq("id", id)
    .in("status", depois ? ["aberta", "fechada"] : ["aberta"])
    .select("id, pergunta, contexto, contato_nome, contato_telefone");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || !data.length) {
    // alguém respondeu (ou fechou) primeiro
    const { data: atual } = await sb().from("tratorilson_perguntas").select("status, respondido_por").eq("id", id).maybeSingle();
    return NextResponse.json({ error: "já resolvida", por: atual?.respondido_por || null, status: atual?.status || null }, { status: 409 });
  }

  // A resposta vira REGRA na memória (vale pro atendimento dos clientes no zap)
  const p = data[0];
  const conteudo =
    `Situação nova ensinada pela equipe. Quando acontecer algo como: "${String(p.pergunta).slice(0, 300)}" — ` +
    `faça/responda assim: ${resposta}`;
  const regraId = await gravarRegra(conteudo, "clientes", `pergunta-tratorilson:${quem}`, "chatwoot");

  // O cliente que ficou esperando ("vou confirmar e já te retorno") recebe a
  // resposta no WhatsApp — a IA redige com a orientação da equipe (best-effort).
  if (depois) return NextResponse.json({ ok: true, regraId, retorno: null });

  const retorno = await retornarAoCliente({
    telefone: p.contato_telefone ? String(p.contato_telefone) : null,
    nome: p.contato_nome ? String(p.contato_nome) : null,
    pergunta: String(p.pergunta || ""),
    contexto: p.contexto ? String(p.contexto) : null,
    respostaEquipe: resposta,
    quem: String(quem),
  });

  return NextResponse.json({ ok: true, regraId, retorno });
}

// Fechar sem responder (descartar) — some do alerta e da lista de abertas.
export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await sb()
    .from("tratorilson_perguntas")
    .update({ status: "fechada", respondido_por: auth.email || auth.userId, respondido_em: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "aberta");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
