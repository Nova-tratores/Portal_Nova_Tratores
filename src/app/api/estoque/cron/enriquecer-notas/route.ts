import { NextRequest, NextResponse } from 'next/server';
import { cronEnriquecerNotas } from '@/lib/estoque/cron';
import { agendadorJaRodou } from '@/lib/agendador/reserva';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min (mas roda em background)

// Enriquecimento diário de notas_entrada (nome do emitente + categoria) em toda a
// história (default desde 11/2022), por conta (NOVA + CASTRO). Equivalente
// automático do botão "Enriquecer emitente/categoria" da tela. Disparado por cron
// com Bearer CRON_SECRET.
//
// FIRE-AND-FORGET: varre todos os meses × contas (sequencial, com sleeps internos);
// inicia em background e responde 200 na hora. Resultado vai para os logs.
// Params opcionais: ?ano=2022&mes=11 para mudar o início da varredura.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ano = parseInt(req.nextUrl.searchParams.get('ano') || '') || 2022;
  const mes = parseInt(req.nextUrl.searchParams.get('mes') || '') || 11;

  // RESERVA (05/11/2026): o agendador do portal roda este sync no worker (tarefa estoque-enriquecer-notas).
  // O GitHub só roda se o portal não tiver rodado bem nas últimas 26 h.
  const feito = await agendadorJaRodou('estoque-enriquecer-notas', 26);
  if (feito) return NextResponse.json({ ok: true, pulado: `o agendador do portal já rodou (${feito})` });
  cronEnriquecerNotas({ ano, mes })
    .then((r) => console.log('[cron enriquecer-notas] concluído', JSON.stringify(r)))
    .catch((e) => console.error('[cron enriquecer-notas] erro', (e as Error).message));

  return NextResponse.json({ sucesso: true, iniciado: true, desde: { ano, mes }, timestamp: new Date().toISOString() });
}
