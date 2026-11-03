import { NextResponse } from "next/server";
import { protegerRotaOuInterna } from "@/lib/auth/chamada-interna";

// Diagnóstico: mostra os últimos webhooks que o Omie mandou pro portal.
// Se "total" for 0, o Omie NÃO está enviando (webhook não configurado / URL errada).
type WebhookLog = { recebido_em: string; topic: string; appKey: string; ping: boolean };

// Só admin (ou curl com CRON_SECRET): a lista traz a appKey das contas Omie, que é
// justamente o que o webhook confere.
export async function GET(req: Request) {
  const guarda = await protegerRotaOuInterna(req, [{ admin: true }]);
  if (guarda.resposta) return guarda.resposta;
  const g = globalThis as unknown as { __omieWebhookLog?: WebhookLog[] };
  const log = g.__omieWebhookLog || [];
  const ultimo = log[0] || null;
  return NextResponse.json({
    recebendo: log.length > 0,
    total: log.length,
    ultimo_recebido_em: ultimo?.recebido_em || null,
    ultimo_topic: ultimo?.topic || null,
    dica: log.length === 0
      ? "Nenhum webhook recebido desde o último deploy. Confira no Omie se o webhook está cadastrado e ativo apontando para /api/clientes/webhook, e fature uma OS/pedido de teste."
      : "Webhooks estão chegando. Veja a lista abaixo.",
    ultimos: log.slice(0, 15),
  });
}
