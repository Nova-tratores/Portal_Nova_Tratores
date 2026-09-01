// Tratorilson no NovaZap (ChatWoot): o Rails do zap manda a conversa pra cá
// e recebe a resposta pronta do modo cliente. Protegido por token simples
// (mesmo padrão do vigia): TRATORILSON_TOKEN no env ou o padrão embutido.
// O uso é registrado no tratorilson_log (tipo 'novazap:auto').
import { NextRequest, NextResponse } from "next/server";
import { PERSONA_CLIENTE_WHATSAPP } from "@/lib/assistente/conhecimento";
import { chamarIA, getIA } from "@/lib/assistente/ia";
import { logTratorilson } from "@/lib/assistente/log";

export const dynamic = "force-dynamic";

const TOKEN_PADRAO = "tratorilson-nt-6049";

interface MsgEntrada {
  de?: string; // 'cliente' | 'loja'
  texto?: string;
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-tratorilson-token") || "";
  const esperado = process.env.TRATORILSON_TOKEN || TOKEN_PADRAO;
  if (token !== esperado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const entrada: MsgEntrada[] = Array.isArray(body?.mensagens) ? body.mensagens : [];
  const chat = entrada
    .slice(-14)
    .map((m) => ({
      role: m.de === "cliente" ? ("user" as const) : ("assistant" as const),
      content: String(m.texto || "").slice(0, 2000),
    }))
    .filter((m) => m.content);
  if (!chat.length || chat[chat.length - 1].role !== "user") {
    return NextResponse.json({ resposta: "" });
  }

  const nome = String(body?.contato?.nome || "").slice(0, 120);
  const telefone = String(body?.contato?.telefone || "").slice(0, 30);
  const system =
    PERSONA_CLIENTE_WHATSAPP +
    (nome
      ? `\n\nO nome do contato no WhatsApp é "${nome}" (pode estar incompleto ou ser apelido — confirme o nome completo quando precisar dele).`
      : "");

  try {
    const data = await chamarIA({
      messages: [{ role: "system", content: system }, ...chat],
      temperature: 0.6,
      max_tokens: 350,
    });
    const resposta = String(data?.choices?.[0]?.message?.content || "").trim();
    const tokens = Number(data?.usage?.total_tokens) || 0;

    await logTratorilson({
      userName: nome || telefone || "cliente WhatsApp",
      tipo: "novazap:auto",
      pergunta: [...chat].reverse().find((m) => m.role === "user")?.content || "",
      resposta,
      modelo: getIA().model,
      tokens,
    });

    return NextResponse.json({ resposta });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "erro na IA" },
      { status: 502 }
    );
  }
}
