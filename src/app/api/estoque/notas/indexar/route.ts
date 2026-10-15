// Admin: reindexa as fontes e roda um lote curto do worker (o resto fica para
// o agendador de 10 min em produção).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { guardarLote, indexarNotas, migracaoFaltando } from '@/lib/notas/cache-docs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, [{ admin: true }]);
  if (guarda.resposta) return guarda.resposta;
  const limite = Math.max(0, Math.min(60, parseInt(req.nextUrl.searchParams.get('limite') || '30', 10) || 30));
  try {
    const idx = await indexarNotas({ completo: true }); // botão do admin: reindexa tudo
    if (idx.erro && migracaoFaltando(idx.erro)) {
      return NextResponse.json({ erro: 'Cache de notas ainda não instalado no banco (aplicar sql/notas-fiscais-cache.sql).', migracaoFaltando: true }, { status: 503 });
    }
    const lote = limite > 0 ? await guardarLote({ limite }) : null;
    return NextResponse.json({ ok: true, indexadas: idx, lote });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
