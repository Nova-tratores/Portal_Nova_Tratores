// Webhook do WhatsApp (Meta Cloud API)
//  GET  -> verificação do webhook (Meta envia hub.challenge)
//  POST -> recebe mensagens dos clientes e responde com o Tratorilson
import { NextRequest, NextResponse } from "next/server";
import { enviarWhatsApp, responderCliente } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Evita processar a mesma mensagem duas vezes (a Meta reenvia se demorar a responder)
const idsVistos = new Set<string>();

// --- Verificação (a Meta chama isto ao configurar o webhook) ---
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

// --- Receção de mensagens ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];

    // Pode ser apenas um status (entregue/lido) — ignora
    if (!msg) return NextResponse.json({ ok: true });

    // Deduplicação por id da mensagem
    if (msg.id) {
      if (idsVistos.has(msg.id)) return NextResponse.json({ ok: true });
      idsVistos.add(msg.id);
      if (idsVistos.size > 1000) idsVistos.clear();
    }

    const from: string = msg.from;
    let texto = "";
    switch (msg.type) {
      case "text": texto = msg.text?.body || ""; break;
      case "image": texto = "[O cliente enviou uma foto]"; break;
      case "video": texto = "[O cliente enviou um vídeo]"; break;
      case "audio": texto = "[O cliente enviou um áudio]"; break;
      case "location": texto = `[O cliente enviou a localização: ${msg.location?.latitude}, ${msg.location?.longitude}]`; break;
      default: texto = "[mensagem recebida]";
    }

    const nome: string | undefined = value?.contacts?.[0]?.profile?.name;

    const reply = await responderCliente(from, texto, nome);
    await enviarWhatsApp(from, reply);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[whatsapp webhook] erro:", e);
    // Devolve sempre 200 para a Meta não entrar em loop de reenvio
    return NextResponse.json({ ok: true });
  }
}
