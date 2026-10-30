// GET /api/agro/painel/pagina?t=<token> — a página do Dashboard Agro. Quem chega sem
// token válido recebe 403: o token vem de /api/agro/dashboard-token, que exige login
// e o módulo. Os dados vão pela rota /rest, com o login do usuário a cada pedido.
import { readFile } from 'fs/promises';
import path from 'path';
import { segredoPainel, validarTokenDashboard } from '@/lib/agro/dashboard-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || '';
  const r = validarTokenDashboard(segredoPainel(), t);
  if (!r.ok) {
    return new Response('Abra o Dashboard Agro pela guia do portal.', {
      status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const html = await readFile(path.join(process.cwd(), 'src/lib/agro/painel/painel.html'), 'utf8');
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // O OSM recusa imagem de mapa sem a origem; o token da URL não vaza (só a origem vai).
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
