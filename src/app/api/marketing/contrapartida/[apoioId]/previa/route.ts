// Prévia do relatório na tela: a MESMA estrutura que vira PDF e corpo de
// e-mail, mais a lista do que ainda falta registrar. A tela mostra esse
// contador antes de deixar enviar pra fábrica.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { dadosDoRelatorio } from '@/lib/marketing/relatorio-contrapartida';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ apoioId: string }> }) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;

  try {
    const { apoioId } = await ctx.params;
    const rel = await dadosDoRelatorio(apoioId);
    if (!rel) return NextResponse.json({ error: 'Apoio não encontrado' }, { status: 404 });
    return NextResponse.json({ relatorio: rel });
  } catch (e) {
    return erroResposta(e, 'GET /contrapartida/previa');
  }
}
