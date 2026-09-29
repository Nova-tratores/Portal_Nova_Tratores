// Endereço público do portal, usado em links que saem do portal (Omie,
// WhatsApp, e-mail). Um lugar só.
//
// O domínio que responde é https://portal.novatratores.com. A variável
// NEXT_PUBLIC_SITE_URL no Railway ficou um tempo com ".com.br" (que não existe
// no DNS) — por isso o valor da env passa por uma correção antes de ser usado.
const PADRAO = 'https://portal.novatratores.com';

export function portalBase(): string {
  const env = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (!env) return PADRAO;
  // typo histórico: portal.novatratores.com.br → portal.novatratores.com
  if (/^https?:\/\/portal\.novatratores\.com\.br$/i.test(env)) return PADRAO;
  // localhost/preview continuam valendo (dev)
  return env;
}

export const PORTAL_BASE = portalBase();
