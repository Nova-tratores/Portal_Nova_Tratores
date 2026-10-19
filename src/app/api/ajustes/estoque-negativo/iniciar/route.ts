import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { iniciarScanNegativos } from '@/lib/ajustes/negativos';
import { autorDe } from '@/lib/ajustes/permissao-server';
import { protegerRotaOuInterna } from '@/lib/auth/chamada-interna';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Inicia a varredura de estoque negativo em background (worker-ready: ajustes_jobs).
// Chamado pela tela /ajustes/negativos e pelo cron ajustes-scan-negativos.yml (Bearer CRON_SECRET).
export async function POST(req: NextRequest) {
  const g = await protegerRotaOuInterna(req, [{ modulo: 'ajustes', acao: 'negativos' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  // Autoria do login; na chamada de sistema (cron) fica 'cron', como antes.
  const criadoPor = g.interno ? 'cron' : autorDe(g.user);
  try {
    const r = await iniciarScanNegativos(conta, criadoPor);
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
