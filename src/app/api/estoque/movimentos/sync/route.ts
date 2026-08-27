import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { sincronizarLote } from '@/lib/estoque/movimentos-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Backfill/cron do razão de estoque (MovimentoEstoque) → tabela estoque_movimentos.
// Processa UM lote de produtos ainda não sincronizados e devolve o progresso; o
// chamador repete até restantes=0 (backfill resumível). Também serve de cron
// incremental (rodar com uma janela recente + resetar).
//
// GET/POST /api/estoque/movimentos/sync?conta=nova&grupo=peca&batch=60&desde=01/09/2025&ate=31/08/2026
function dataBRdefault(offMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offMonths);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function handle(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta((sp.get('conta') || '').toUpperCase()) ?? 'NOVA';
  const grupo = sp.get('grupo') === 'maquina' ? 'maquina' : 'peca';
  const batch = Math.min(200, Math.max(1, parseInt(sp.get('batch') || '60') || 60));
  const dataDeBR = sp.get('desde') || dataBRdefault(18);
  const dataAteBR = sp.get('ate') || dataBRdefault(0);
  try {
    const r = await sincronizarLote(conta, { grupo, dataDeBR, dataAteBR, batch });
    return NextResponse.json({ ok: true, conta, grupo, janela: { desde: dataDeBR, ate: dataAteBR }, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
