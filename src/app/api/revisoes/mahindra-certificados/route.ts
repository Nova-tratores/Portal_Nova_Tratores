import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { sincronizarCertificados, ultimaSincronizacao } from '@/lib/mahindra/portal-dealer-server';
import { limparCacheVendidos } from '@/lib/revisoes/vendidos-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Certificados de garantia do portal de concessionárias da Mahindra (aba "Garantia").
// GET  → quando foi a última leitura e se o robô está configurado.
// POST { todos? } → lê agora (entra no site da Mahindra, só leitura) e grava em mahindra_certificados.
// Automático: o agendador lê de hora em hora (tarefa mahindra-certificados) e o Radar Tratores lê ao abrir se passou de 1 h.

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }, { modulo: 'pos' }]);
  if (g.resposta) return g.resposta;
  return NextResponse.json({
    ok: true,
    configurado: !!(process.env.MAHINDRA_DEALER_USUARIO && process.env.MAHINDRA_DEALER_SENHA),
    ultima: await ultimaSincronizacao().catch(() => null),
  });
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'revisoes' }, { modulo: 'feedbacks' }]);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  try {
    const r = await sincronizarCertificados({ todos: body?.todos === true });
    if (r.gravados) limparCacheVendidos();
    return NextResponse.json({ ...r, ok: true, ultima: await ultimaSincronizacao().catch(() => null) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
