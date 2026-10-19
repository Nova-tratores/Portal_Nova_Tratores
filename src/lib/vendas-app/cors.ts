// CORS das rotas do portal que o app de vendas (vendas-pwa) chama direto do
// navegador. O app abre por mais de um endereço; o header devolve exatamente a
// origem de quem chamou. Endereço novo: VENDAS_APP_ORIGINS=https://a,https://b.

const ORIGENS = [
  process.env.NEXT_PUBLIC_CRM_VENDAS_URL,
  'https://vendas-pwa-production.up.railway.app',
  'https://crm.novatratores.com',
  ...(process.env.VENDAS_APP_ORIGINS || '').split(','),
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:4173'] : []),
]
  .map((o) => String(o || '').trim().replace(/\/+$/, ''))
  .filter((o, i, a) => o && a.indexOf(o) === i);

export function origemVendasPermitida(origem: string | null | undefined): string {
  const o = String(origem || '').replace(/\/+$/, '');
  return ORIGENS.includes(o) ? o : ORIGENS[0];
}

export function corsVendas(req: Request, metodos = 'GET, POST, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origemVendasPermitida(req.headers.get('origin')),
    'Access-Control-Allow-Methods': metodos,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
