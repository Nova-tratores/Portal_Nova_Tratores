import { NextRequest, NextResponse } from 'next/server';
import { acessoDashboard } from '@/lib/estoque/dashboard-auth';
import { parseConta } from '@/lib/estoque/conta';
import { montarDashboard } from '@/lib/estoque/dashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dashboard de vendas: cards por categoria com comparativo mês/ano e projeção.
// `modo=ano` (ou mes=0) agrega o ano inteiro em vez de um mês.
// Portado de /api/dashboard (server.js:1395).
export async function GET(req: NextRequest) {
  const { negado, maquinas } = await acessoDashboard(req);
  if (negado) return negado;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const mesParam = sp.get('mes') ? parseInt(sp.get('mes')!) : now.getMonth() + 1;
  const modo = sp.get('modo') === 'ano' || mesParam === 0 ? 'ano' : 'mes';
  const selMes = modo === 'ano' ? 0 : mesParam;
  const selAno = sp.get('ano') ? parseInt(sp.get('ano')!) : now.getFullYear();
  const filtroCategoria = sp.get('categoria') || null;
  // Garantia, campanhas, seguro e promoção ficam fora do Serviços, salvo com a caixinha.
  const incluirNC = sp.get('incluirNaoComercial') === '1';

  try {
    const dados = await montarDashboard(selMes, selAno, filtroCategoria, conta, modo, incluirNC);
    // Sem estoque:dashboard-maquinas os dados de máquinas nem saem do servidor.
    if (!maquinas) {
      dados.categorias = dados.categorias.filter((c) => c.cardType !== 'maquina' && c.cardType !== 'totalMaquinas');
      dados.maquinasYTD = { unidades: 0, receita: 0 };
    }
    return NextResponse.json({ ...dados, podeMaquinas: maquinas });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
