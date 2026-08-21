import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { getContasOmie } from '@/lib/ajustes/omie';
import { atualizarSnapshotIncremental, recomputarSnapshotCompleto, minerarCfopDeConcluidos, JANELA_INICIAL_BR } from '@/lib/ajustes/recebimentos';
import { hoje, addDias, fmtBR } from '@/lib/ajustes/dates';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 800; // seed completo (01/11/2022→hoje) é pesado

// Atualização DIÁRIA do cache de recebimentos pendentes (janela grande 01/11/2022→hoje):
// merge INCREMENTAL — recomputa só a janela recente e mantém o histórico congelado.
// ?seed=1 força o recompute COMPLETO (reconciliação); ?conta=NOVA limita a uma conta.
// Auth: Bearer CRON_SECRET. Disparado 1×/dia (~04h BRT). Fire-and-forget do lado do cron.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const seed = sp.get('seed') === '1' || sp.get('seed') === 'true';
  const contaParam = parseConta(sp.get('conta'));
  const contas = contaParam ? [contaParam] : getContasOmie().map((c) => c.id);
  const resultados: Record<string, any> = {};
  const ateBR = fmtBR(hoje());
  for (const c of contas) {
    try {
      resultados[c] = seed ? await recomputarSnapshotCompleto(c) : await atualizarSnapshotIncremental(c);
    } catch (e) {
      resultados[c] = { erro: (e as Error).message };
    }
    // minera o mapa CFOP (ncm,saída→entrada) dos recebimentos concluídos:
    // seed = janela ampla (backfill 01/11/2022→hoje); incremental = últimos ~90 dias.
    try {
      const deBR = seed ? JANELA_INICIAL_BR : fmtBR(addDias(hoje(), -90));
      const cfop = await minerarCfopDeConcluidos(c, deBR, ateBR);
      resultados[c] = { ...(resultados[c] || {}), cfop };
    } catch (e) {
      resultados[c] = { ...(resultados[c] || {}), cfopErro: (e as Error).message };
    }
  }
  return NextResponse.json({ sucesso: true, seed, resultados, timestamp: new Date().toISOString() });
}
