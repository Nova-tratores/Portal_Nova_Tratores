// GET  ?id=  -> prévia (o que está na Omie × portal)
// POST {id}  -> fatura (emite a NF-e). Ação EXPLÍCITA pedidos-maquinas:faturar.
// Liga/desliga: PEDIDOS_MAQUINAS_FATURAR = off (padrão) | dev | on.
import { guardar, autor, respostaErro } from '@/lib/pedidos-maquinas/server';
import { simularFaturamento, faturarPedidoMaquina } from '@/lib/pedidos-maquinas/omie';
import { autenticar } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function bloqueioDoFaturamento(req: Request): Promise<string | null> {
  const modo = (process.env.PEDIDOS_MAQUINAS_FATURAR || 'off').toLowerCase();
  if (modo === 'on') return null;
  if (modo === 'dev') {
    const a = await autenticar(req);
    return a?.isDev ? null : 'Faturar pelo portal ainda está em teste (só para o Dev). Fature na Omie.';
  }
  return 'Faturar pelo portal ainda não foi liberado. Fature na Omie.';
}

export async function GET(req: Request) {
  const g = await guardar(req, 'faturar');
  if (g.resposta) return g.resposta;
  try {
    const bloqueio = await bloqueioDoFaturamento(req);
    const previa = await simularFaturamento(new URL(req.url).searchParams.get('id') || '');
    return Response.json({ ...previa, bloqueio });
  } catch (e) {
    return respostaErro(e, 'faturar simular');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'faturar');
  if (g.resposta) return g.resposta;
  try {
    const bloqueio = await bloqueioDoFaturamento(req);
    if (bloqueio) return Response.json({ error: bloqueio }, { status: 403 });
    const b = await req.json().catch(() => ({}));
    return Response.json({ ok: true, ...(await faturarPedidoMaquina(b.id, autor(g.user))) });
  } catch (e) {
    return respostaErro(e, 'faturar');
  }
}
