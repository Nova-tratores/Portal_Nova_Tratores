// CORS das rotas que o NovaZap (fork do Chatwoot) chama direto do navegador.
// O Chatwoot abre por MAIS DE UM endereço (domínio do Railway e
// novazap.novatratores.com); o header precisa devolver exatamente a origem
// de quem chamou — com um valor fixo, quem entrava pelo domínio próprio via
// a busca de cliente/máquinas voltar vazia (o navegador descarta a resposta).
// Endereço novo: CHATWOOT_ORIGINS=https://a,https://b (sem barra no fim).

const ORIGENS = [
  process.env.CHATWOOT_URL,
  'https://chatwoot-production-e3ef.up.railway.app',
  'https://novazap.novatratores.com',
  ...(process.env.CHATWOOT_ORIGINS || '').split(','),
]
  .map((o) => String(o || '').trim().replace(/\/+$/, ''))
  .filter((o, i, a) => o && a.indexOf(o) === i);

export function origemPermitida(origem: string | null | undefined): string {
  const o = String(origem || '').replace(/\/+$/, '');
  return ORIGENS.includes(o) ? o : ORIGENS[0];
}

export function corsChatwoot(req: Request, metodos = 'GET, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origemPermitida(req.headers.get('origin')),
    'Access-Control-Allow-Methods': metodos,
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
