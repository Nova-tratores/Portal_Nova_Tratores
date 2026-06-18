import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { detectarMesesSuspeitos } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Meses zerados/parciais em vendas_itens (só leitura). ?pct=N ajusta threshold.
// Portado de GET /api/admin/meses-zerados (server.js:2196).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  if (!conta) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO' });
  const pct = sp.get('pct') ? parseInt(sp.get('pct') || '', 10) : 30;
  const r = await detectarMesesSuspeitos(conta, pct);
  return NextResponse.json({
    conta,
    total: r.total,
    pct: r.pct,
    mediana: r.mediana,
    threshold: r.threshold,
    medianaSoma: r.medianaSoma,
    thresholdSoma: r.thresholdSoma,
    medianaCount: r.medianaCount,
    thresholdCount: r.thresholdCount,
    zerados: r.zerados.length,
    parciais: r.parciais.length,
    suspeitos: r.suspeitos.length,
    meses: r.suspeitos.map((m) => ({ mes: m.mes, ano: m.ano })),
    detalhe: { zerados: r.zerados, parciais: r.parciais },
  });
}
