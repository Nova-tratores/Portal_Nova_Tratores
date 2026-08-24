import { NextRequest, NextResponse } from 'next/server';
import { classificarRecebidosTodasContas, classificarRecebidos } from '@/lib/ajustes/robo-recebidos';
import { parseConta } from '@/lib/ajustes/conta';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Robô diário: classifica produtos recém-recebidos (sem família, valor < 10k) como
// "Peças", sugere o Tipo e cria tarefas de confirmação (localização + Tipo) para o
// responsável de peças. Auth: Bearer CRON_SECRET. Fire-and-forget (pode demorar).
// ?conta=NOVA limita a uma conta; ?sync=1 aguarda e devolve o resumo (p/ teste manual).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const dry = sp.get('dry') === '1' || sp.get('dry') === 'true';
  const aguardar = dry || sp.get('sync') === '1' || sp.get('sync') === 'true'; // dry sempre síncrono
  const job = conta ? classificarRecebidos(conta, { dry }) : classificarRecebidosTodasContas({ dry });
  if (aguardar) {
    const resultado = await job;
    return NextResponse.json({ sucesso: true, dry, resultado, timestamp: new Date().toISOString() });
  }
  Promise.resolve(job).catch((e) => console.error('[cron classificar-recebidos]', e));
  return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() });
}
