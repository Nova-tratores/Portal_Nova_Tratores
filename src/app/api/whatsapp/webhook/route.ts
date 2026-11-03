// Webhook do WhatsApp (Meta Cloud API)
//  GET  -> verificação do webhook (Meta envia hub.challenge)
//  POST -> recebe mensagens dos clientes e responde com o Tratorilson
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
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
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN || "";
  if (mode === "subscribe" && !!esperado && token === esperado) {
    return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

// Assinatura da Meta (X-Hub-Signature-256 = HMAC-SHA256 do corpo cru com o App
// Secret). Sem WHATSAPP_APP_SECRET ninguém passa: quem soubesse a URL fazia o
// número da empresa responder a qualquer telefone, gastando IA e mensagens.
function assinaturaMetaValida(cru: string, assinatura: string | null): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET || "";
  if (!segredo || !assinatura?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(crypto.createHmac("sha256", segredo).update(cru, "utf8").digest("hex"));
  const recebido = Buffer.from(assinatura.slice(7));
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

// --- Receção de mensagens ---
export async function POST(req: NextRequest) {
  const cru = await req.text();
  if (!assinaturaMetaValida(cru, req.headers.get("x-hub-signature-256"))) {
    return new Response("Forbidden", { status: 401 });
  }
  try {
    const body = JSON.parse(cru);
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
