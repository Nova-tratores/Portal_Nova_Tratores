// NovaZap: transcreve um áudio da conversa (texto embaixo do áudio).
// O Rails do zap chama com o link do arquivo; a chave da OpenAI fica só aqui.
// POST { url } -> { texto }   (texto vazio = não deu para transcrever)
import { NextRequest, NextResponse } from "next/server";
import { tokenValidoNovazap, transcreverAudio } from "@/lib/assistente/transcrever-audio";
import { logTratorilson } from "@/lib/assistente/log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!tokenValidoNovazap(req.headers.get("x-tratorilson-token"))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const url = String(body?.url || "");
  if (!/^https?:\/\//.test(url)) return NextResponse.json({ erro: "url do áudio obrigatória" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ erro: "OPENAI_API_KEY não configurada no portal" }, { status: 503 });

  const texto = await transcreverAudio(url);
  await logTratorilson({
    userName: String(body?.contato || "NovaZap").slice(0, 120),
    tipo: "novazap:transcricao",
    pergunta: url.split("?")[0].slice(-200),
    resposta: texto || "(sem texto)",
    modelo: "gpt-4o-mini-transcribe",
    tokens: 0,
  });
  return NextResponse.json({ texto });
}
