// CORS das rotas do portal que o app dos técnicos (NT_Mecanicos) chama direto do navegador com o token do
// mesmo Supabase. Endereço novo do app: MECANICOS_APP_ORIGINS=https://a,https://b.
const ORIGENS = [
  'https://ntmecanicos-production.up.railway.app',
  'https://mecanicos-nine.vercel.app',
  ...(process.env.MECANICOS_APP_ORIGINS || '').split(','),
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3001', 'http://localhost:3011'] : []),
]
  .map((o) => String(o || '').trim().replace(/\/+$/, ''))
  .filter((o, i, a) => o && a.indexOf(o) === i)

export function corsAppMecanicos(req: Request, metodos = 'GET, OPTIONS'): Record<string, string> {
  const o = String(req.headers.get('origin') || '').replace(/\/+$/, '')
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(o) ? o : ORIGENS[0],
    'Access-Control-Allow-Methods': metodos,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}
