// Solicitações confirmadas no Tratorilson do NovaZap — alimentam o painel
// do ícone do zap no header. GET lista (auth), PATCH marca como atendida.
// A INSERÇÃO acontece na rota /api/assistente/novazap (ferramenta
// registrar_solicitacao, service role).
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { createClient } from "@supabase/supabase-js";
import { chatwootConfigurado, urlConversa } from "@/lib/chatwoot/config";
import { souNotificadoTratorilson, recebeAlertaCentral, recebeAvisosNovazap, definirAvisosNovazap } from "@/lib/assistente/notificados";
import { roboLigado } from "@/lib/assistente/robo-status";

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
    const { data, error } = await sb()
      .from("tratorilson_solicitacoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw error;
    const lista = (data || []).map((s) => ({
      ...s,
      link: s.conversa_id && chatwootConfigurado() ? urlConversa(s.conversa_id) : null,
    }));
    // "Receber avisos do NovaZap" desligado: sem número no ícone e sem janela no meio da tela
    const [receber, robo] = await Promise.all([recebeAvisosNovazap(auth.userId), roboLigado()]);
    // badge do ícone: pedidos novos + clientes esperando atendimento
    const novas = receber ? lista.filter((s) => (s.fase || (s.status === "atendida" ? "concluida" : "nova")) === "nova").length : 0;
    // "Dispensadas sem atualizar": cards de atendimento dispensados sem ensinar o Tratorilson
    // + perguntas do Tratorilson que alguém fechou sem responder.
    const { data: pergFechadas } = await sb().from("tratorilson_perguntas").select("*").eq("status", "fechada")
      .order("criado_em", { ascending: false }).limit(60);
    // alerta central "precisa de atendimento": só Devs + escolhidos no Admin
    const souNotificado = await souNotificadoTratorilson(auth);
    // modal "precisa de atendimento" só pra quem é do pós-vendas (o resto: sino)
    const alertaCentral = await recebeAlertaCentral(auth);
    return NextResponse.json(
      // roboLigado: null = não deu pra saber (trata como ligado)
      { solicitacoes: lista, novas, perguntasFechadas: pergFechadas || [], souNotificado, alertaCentral, receberAvisos: receber, roboLigado: robo !== false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // tabela ainda não criada → painel vazio, sem quebrar
    return NextResponse.json({ solicitacoes: [], novas: 0, aviso: "tabela tratorilson_solicitacoes não encontrada — rode sql/tratorilson-solicitacoes.sql" });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const FASES = ["nova", "orcamento", "aguardando_data", "agendado", "execucao", "concluida"];
  const mudanca: Record<string, unknown> = {};
  if (typeof body?.fase === "string" && FASES.includes(body.fase)) {
    mudanca.fase = body.fase;
    if (body.fase === "concluida") {
      mudanca.status = "atendida";
      mudanca.atendida_por = auth.email || auth.userId || "portal";
      mudanca.atendida_em = new Date().toISOString();
    }
  }
  if (body?.data_servico === null || typeof body?.data_servico === "string") {
    mudanca.data_servico = body.data_servico || null;
  }
  if (!Object.keys(mudanca).length) return NextResponse.json({ error: "nada pra mudar" }, { status: 400 });

  const { error } = await sb().from("tratorilson_solicitacoes").update(mudanca).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST { receberAvisos: boolean } — chave "Receber avisos do NovaZap" do próprio usuário
export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.receberAvisos !== "boolean") return NextResponse.json({ error: "receberAvisos obrigatório" }, { status: 400 });
  try {
    await definirAvisosNovazap(auth.userId, body.receberAvisos);
    return NextResponse.json({ ok: true, receberAvisos: body.receberAvisos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao salvar" }, { status: 500 });
  }
}
