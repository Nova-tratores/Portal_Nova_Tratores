// Configuração da integração com o NovaZap (fork do Chatwoot).
//
// As três variáveis vivem no Railway (e devem ser copiadas para o .env.local
// para testar localmente). O token é de CONTA e só pode ser lido no servidor —
// nunca importar este módulo em componente cliente.
//
// Mesma montagem de URL da rota /api/chatwoot/vincular (único outro ponto do
// portal que fala com a API do Chatwoot).

export const CHATWOOT_URL = (process.env.CHATWOOT_URL || "").replace(/\/$/, "");
export const CHATWOOT_ACCOUNT_ID = (process.env.CHATWOOT_ACCOUNT_ID || "").trim();
export const CHATWOOT_API_TOKEN = (process.env.CHATWOOT_API_TOKEN || "").trim();

export function chatwootConfigurado(): boolean {
  return Boolean(CHATWOOT_URL && CHATWOOT_ACCOUNT_ID && CHATWOOT_API_TOKEN);
}

/** Base da API de conta: `${URL}/api/v1/accounts/${id}`. */
export function baseApiConta(): string {
  return `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}`;
}

/** URL da conversa no painel do NovaZap (abre direto na conversa). */
export function urlConversa(displayId: number | string, url = CHATWOOT_URL, accountId = CHATWOOT_ACCOUNT_ID): string {
  return `${url.replace(/\/$/, "")}/app/accounts/${accountId}/conversations/${displayId}`;
}
