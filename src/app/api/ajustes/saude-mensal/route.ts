import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { saudeMensal } from '@/lib/ajustes/pedidos';

export const dynamic = 'force-dynamic';

// Saude mensal: KPIs de correcoes + alertas + encerramentos do mes. Query: conta?, mes=YYYY-MM.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const agora = new Date();
  const mesQuery = (sp.get('mes') || '').match(/^(\d{4})-(\d{2})$/);
  const ano = mesQuery ? parseInt(mesQuery[1], 10) : agora.getFullYear();
  const mes = mesQuery ? parseInt(mesQuery[2], 10) : (agora.getMonth() + 1);
  try {
    const out = await saudeMensal({ conta, ano, mes });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
