import { NextRequest, NextResponse } from 'next/server';
import { getContasOmie, type Conta } from '@/lib/estoque/conta';
import { iniciarPopularCompras } from '@/lib/estoque/compras-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/popular-compras (server.js:4237). Repopula compras_itens + notas_entrada
// (NF-e fornecedor + contas a pagar + enriquecimento) em background, por conta.
export async function GET(req: NextRequest) {
  const reqConta = (req.nextUrl.searchParams.get('conta') || '').trim();
  const contasAlvo: Conta[] =
    reqConta && reqConta.toLowerCase() !== 'todas'
      ? (reqConta === 'NOVA' || reqConta === 'CASTRO' ? [reqConta] : [])
      : getContasOmie().map((c) => c.id);
  if (contasAlvo.length === 0) return NextResponse.json({ erro: 'Informe ?conta=NOVA|CASTRO|todas' });

  const { contasIniciadas, contasPuladas } = iniciarPopularCompras(contasAlvo);
  if (contasIniciadas.length === 0) {
    return NextResponse.json({ erro: 'Todas as contas solicitadas ja estao sincronizando', puladas: contasPuladas });
  }
  return NextResponse.json({
    mensagem: 'Populando compras em background (paralelo)',
    contasIniciadas,
    contasPuladas,
  });
}
