// =============================================================================
// MODO ENSINO do Tratorilson — conversa SÓ COM DEV pra ensinar regras que valem
// nos dois Tratorilsons (portal + atendimento de clientes no NovaZap/WhatsApp).
//
//   POST  { messages }            → turno do chat de ensino (IA com ferramentas
//                                   de memória: ensinar/listar/atualizar/esquecer)
//   GET                           → lista a memória completa (ativas e inativas)
//   PATCH { id, conteudo?, ativo?, escopo? } → edição direta pela tela
//
// Tudo gateado em autenticar().isDev. Log em tratorilson_log tipo 'ensinar'.
// =============================================================================
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { chamarIA, getIA } from "@/lib/assistente/ia";
import { blocoMemoria, gravarRegra } from "@/lib/assistente/memoria";
import { logTratorilson } from "@/lib/assistente/log";

export const runtime = "nodejs";
export const maxDuration = 60;

const SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const H = () => ({ apikey: SK(), authorization: `Bearer ${SK()}`, "Content-Type": "application/json" });
const TBL = () => `${SB()}/rest/v1/tratorilson_memoria`;

/* eslint-disable @typescript-eslint/no-explicit-any */

const PERSONA_ENSINO = `Você é o Tratorilson em MODO ENSINO, conversando em particular com o DESENVOLVEDOR do portal da Nova Tratores.
Aqui o objetivo é UM só: entender o que ele quer te ensinar e gravar isso na sua MEMÓRIA — a memória é ÚNICA e vale nos seus dois lugares de trabalho: o chat interno do portal e o atendimento de clientes no WhatsApp (NovaZap).

COMO AGIR:
- Ele explica; você INTERPRETA e reescreve a regra do seu jeito: curta, clara, no imperativo, sem depender do contexto da conversa (a regra vai ser lida sozinha depois).
- Se a instrução estiver CLARA, grave direto com a ferramenta 'ensinar' e mostre como ficou a regra gravada.
- Se estiver AMBÍGUA (dois entendimentos possíveis, falta um dado essencial), mostre a regra como você entendeu e faça UMA pergunta objetiva antes de gravar.
- MÓDULO (bloco do assunto): classifique cada regra num módulo — chatwoot (atendimento no WhatsApp), revisoes (revisões/orçamentos), pos (ordens de serviço), ppv (peças), requisicoes, financeiro, ou geral. Diga qual usou.
- ESCOPO: decida sozinho pelo conteúdo — regra sobre atendimento/conversa com cliente no WhatsApp → 'clientes'; regra sobre uso interno do portal (telas, requisições, quem faz o quê) → 'portal'; vale nos dois ou na dúvida → 'geral'. Diga qual escopo usou.
- Pediu pra ver o que você sabe → 'listar_memoria'. Pediu pra corrigir/mudar → 'atualizar_memoria'. Pediu pra esquecer → 'esquecer_memoria'.
- Uma mensagem dele pode ter VÁRIAS regras: grave cada uma separada.
- Responda sempre curto e direto, em português do Brasil, sem formalidade exagerada. Nada de rodeio: entendeu → gravou → confirmou.`;

const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "ensinar",
      description: "Grava UMA regra nova na memória.",
      parameters: { type: "object", properties: { conteudo: { type: "string", description: "A regra, curta e autossuficiente." }, escopo: { type: "string", enum: ["geral", "portal", "clientes"] }, modulo: { type: "string", enum: ["geral", "chatwoot", "revisoes", "pos", "ppv", "requisicoes", "financeiro"] } }, required: ["conteudo", "escopo", "modulo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_memoria",
      description: "Lista todas as regras da memória (com id e escopo).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_memoria",
      description: "Altera o conteúdo (e opcionalmente o escopo) de uma regra existente.",
      parameters: { type: "object", properties: { id: { type: "number" }, conteudo: { type: "string" }, escopo: { type: "string", enum: ["geral", "portal", "clientes"] } }, required: ["id", "conteudo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "esquecer_memoria",
      description: "Desativa (remove) uma regra da memória pelo id.",
      parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    },
  },
];

async function rodarFerramenta(name: string, args: any, userName: string): Promise<any> {
  if (name === "ensinar") {
    const conteudo = String(args.conteudo || "").trim();
    if (!conteudo) return { erro: "conteudo vazio" };
    const escopo = ["geral", "portal", "clientes"].includes(String(args.escopo)) ? String(args.escopo) : "geral";
    const modulo = ["geral", "chatwoot", "revisoes", "pos", "ppv", "requisicoes", "financeiro"].includes(String(args.modulo)) ? String(args.modulo) : "geral";
    const id = await gravarRegra(conteudo, escopo, userName, modulo);
    if (id == null) return { erro: "não consegui gravar (tabela tratorilson_memoria existe?)" };
    return { ok: true, id, escopo };
  }
  if (name === "listar_memoria") {
    const r = await fetch(`${TBL()}?ativo=eq.true&select=id,conteudo,escopo,modulo,criado_por&order=id.asc`, { headers: H() });
    if (!r.ok) {
      const r2 = await fetch(`${TBL()}?ativo=eq.true&select=id,conteudo,criado_por&order=id.asc`, { headers: H() });
      if (!r2.ok) return { erro: "tabela não encontrada" };
      const d2: any[] = await r2.json().catch(() => []);
      return { total: d2.length, memoria: d2.map((m) => ({ id: m.id, regra: m.conteudo, escopo: "geral" })) };
    }
    const d: any[] = await r.json().catch(() => []);
    return { total: d.length, memoria: d.map((m) => ({ id: m.id, regra: m.conteudo, escopo: m.escopo || "geral", modulo: m.modulo || "geral" })) };
  }
  if (name === "atualizar_memoria") {
    const id = Number(args.id);
    const conteudo = String(args.conteudo || "").trim();
    if (!id || !conteudo) return { erro: "id e conteudo são obrigatórios" };
    const patch: Record<string, unknown> = { conteudo, updated_at: new Date().toISOString() };
    if (["geral", "portal", "clientes"].includes(String(args.escopo))) patch.escopo = String(args.escopo);
    if (["geral", "chatwoot", "revisoes", "pos", "ppv", "requisicoes", "financeiro"].includes(String(args.modulo))) patch.modulo = String(args.modulo);
    let r = await fetch(`${TBL()}?id=eq.${id}`, { method: "PATCH", headers: H(), body: JSON.stringify(patch) });
    if (!r.ok && patch.escopo) {
      delete patch.escopo;
      r = await fetch(`${TBL()}?id=eq.${id}`, { method: "PATCH", headers: H(), body: JSON.stringify(patch) });
    }
    return r.ok ? { ok: true, id } : { erro: "falha ao atualizar" };
  }
  if (name === "esquecer_memoria") {
    const id = Number(args.id);
    if (!id) return { erro: "id obrigatório" };
    const r = await fetch(`${TBL()}?id=eq.${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ ativo: false, updated_at: new Date().toISOString() }) });
    return r.ok ? { ok: true, id } : { erro: "falha ao remover" };
  }
  return { erro: "ferramenta desconhecida" };
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth?.isDev) return NextResponse.json({ error: "Só o Dev acessa o modo ensino." }, { status: 403 });
  let r = await fetch(`${TBL()}?select=id,conteudo,escopo,modulo,ativo,criado_por,created_at,updated_at&order=id.desc`, { headers: H() });
  if (!r.ok) r = await fetch(`${TBL()}?select=id,conteudo,ativo,criado_por,created_at,updated_at&order=id.desc`, { headers: H() });
  if (!r.ok) return NextResponse.json({ memorias: [], aviso: "Tabela tratorilson_memoria não encontrada — rode a migration." });
  const d: any[] = await r.json().catch(() => []);
  return NextResponse.json({ memorias: d.map((m) => ({ ...m, escopo: m.escopo || "geral", modulo: m.modulo || "geral" })) });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth?.isDev) return NextResponse.json({ error: "Só o Dev acessa o modo ensino." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.conteudo === "string" && b.conteudo.trim()) patch.conteudo = b.conteudo.trim();
  if (typeof b.ativo === "boolean") patch.ativo = b.ativo;
  if (["geral", "portal", "clientes"].includes(String(b.escopo))) patch.escopo = String(b.escopo);
  if (["geral", "chatwoot", "revisoes", "pos", "ppv", "requisicoes", "financeiro"].includes(String(b.modulo))) patch.modulo = String(b.modulo);
  let r = await fetch(`${TBL()}?id=eq.${id}`, { method: "PATCH", headers: H(), body: JSON.stringify(patch) });
  if (!r.ok && patch.escopo) {
    delete patch.escopo;
    r = await fetch(`${TBL()}?id=eq.${id}`, { method: "PATCH", headers: H(), body: JSON.stringify(patch) });
  }
  if (!r.ok) return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth?.isDev) return NextResponse.json({ error: "Só o Dev acessa o modo ensino." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const messages: any[] = Array.isArray(b.messages) ? b.messages : [];
  const userName = String(b.userName || "Dev");
  const limpos = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 3000) }));

  const memAtual = await blocoMemoria(["geral", "portal", "clientes"], "MEMÓRIA ATUAL (o que você já sabe)").catch(() => "");
  const convo: any[] = [{ role: "system", content: PERSONA_ENSINO + memAtual }, ...limpos];

  const pergunta = String([...limpos].reverse().find((m) => m.role === "user")?.content || "").slice(0, 4000);
  let tokens = 0;
  const usadas: string[] = [];

  try {
    for (let volta = 0; volta < 4; volta++) {
      const data = await chamarIA({ messages: convo, tools: FERRAMENTAS, temperature: 0.3, max_tokens: 1200 });
      tokens += Number(data?.usage?.total_tokens) || 0;
      const m = data?.choices?.[0]?.message;
      if (!m) break;
      const calls: any[] = m.tool_calls || [];
      if (!calls.length) {
        const reply = String(m.content || "").trim() || "Não entendi — pode reformular?";
        await logTratorilson({ userId: auth.userId, userName, tipo: usadas.length ? `ensinar:${[...new Set(usadas)].join("+")}` : "ensinar", pergunta, resposta: reply, modelo: getIA().model, tokens }).catch(() => {});
        return NextResponse.json({ reply });
      }
      convo.push(m);
      for (const c of calls) {
        let args: any = {};
        try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* vazio */ }
        usadas.push(c.function?.name);
        const resultado = await rodarFerramenta(String(c.function?.name), args, userName);
        convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(resultado) });
      }
    }
    return NextResponse.json({ reply: "Me perdi no meio do caminho — manda de novo, por favor." });
  } catch (e) {
    return NextResponse.json({ reply: `Deu erro aqui: ${e instanceof Error ? e.message : e}` }, { status: 200 });
  }
}
