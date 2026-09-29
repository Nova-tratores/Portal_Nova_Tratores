// GET /api/agro/dashboard-token — endereço do Dashboard Agro externo com token
// assinado de curta duração. Só quem está logado e tem o módulo recebe.
// O servidor do app externo (repo dashboard-agro-sp, server.js) confere o token
// antes de entregar a página. Sem DASHBOARD_AGRO_TOKEN_SECRET no ambiente, a
// rota devolve o endereço puro e avisa (protegido: false) — assim o portal pode
// ser publicado antes de a variável existir.
import { NextResponse } from 'next/server';
import { guardarAgro, erroAgro, logAgro } from '@/lib/agro/server';
import { urlDashboardComToken, VALIDADE_TOKEN_SEGUNDOS } from '@/lib/agro/dashboard-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardarAgro(req);
  if (g.resposta) return g.resposta;
  try {
    const r = urlDashboardComToken(process.env.DASHBOARD_AGRO_TOKEN_SECRET, g.auth.userId);
    await logAgro(g.auth, { acao: 'dashboard_aberto', entidade: 'dashboard-externo', detalhes: { protegido: r.protegido } });
    return NextResponse.json(
      { url: r.url, protegido: r.protegido, validade_segundos: VALIDADE_TOKEN_SEGUNDOS },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return erroAgro(e, 'dashboard-token GET');
  }
}
