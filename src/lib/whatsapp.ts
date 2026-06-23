// Integração WhatsApp (Meta Cloud API) — enviar mensagens + atender clientes com o Tratorilson.
import { chamarIA } from "@/lib/assistente/ia";
import { PERSONA_CLIENTE_WHATSAPP } from "@/lib/assistente/conhecimento";

const GRAPH = "https://graph.facebook.com/v22.0";

// Envia uma mensagem de texto para um número (formato só dígitos, ex: 5514998638071)
export async function enviarWhatsApp(to: string, texto: string): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error("[whatsapp] falta WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID");
    return false;
  }
  try {
    const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
    });
    if (!r.ok) {
      console.error("[whatsapp] erro ao enviar:", r.status, (await r.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[whatsapp] falha ao enviar:", e);
    return false;
  }
}

// Memória de conversa por número (em memória do processo; reinicia no redeploy).
// TODO: persistir no Supabase para histórico permanente.
type Msg = { role: "user" | "assistant"; content: string };
const conversas = new Map<string, Msg[]>();
const MAX_HIST = 16;

// Recebe a mensagem do cliente, gera a resposta do Tratorilson (modo cliente) e devolve o texto.
export async function responderCliente(from: string, texto: string, nome?: string): Promise<string> {
  const hist = conversas.get(from) || [];
  hist.push({ role: "user", content: texto });

  const sys = PERSONA_CLIENTE_WHATSAPP +
    (nome ? `\n\nO nome do contato no WhatsApp é "${nome}" (pode não ser o nome completo do titular do trator).` : "");

  const messages = [{ role: "system", content: sys }, ...hist.slice(-MAX_HIST)];

  let reply = "Opa, deu um probleminha aqui do meu lado. Pode mandar de novo, por favor?";
  try {
    const j = await chamarIA({ messages, temperature: 0.6, max_tokens: 400 });
    const r = j?.choices?.[0]?.message?.content;
    if (r && r.trim()) reply = r.trim();
  } catch (e) {
    console.error("[whatsapp] erro IA:", e);
  }

  hist.push({ role: "assistant", content: reply });
  conversas.set(from, hist.slice(-MAX_HIST));
  return reply;
}
