import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarNotasEntrada, listarNotasEntradaTodas } from '@/lib/estoque/notas-entrada';

export const dynamic = 'force-dynamic';

// Lista de notas de entrada (paginada). Portado de /api/notas-entrada (server.js:7056).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const sp = req.nextUrl.searchParams;
  const mes = sp.get('mes') ? parseInt(sp.get('mes')!) : undefined;
  const ano = sp.get('ano') ? parseInt(sp.get('ano')!) : undefined;
  const nf = sp.get('nf') || undefined;
  const fornecedor = sp.get('fornecedor') || undefined;
  const descricao = sp.get('descricao') || undefined;
  const pagina = sp.get('pagina') ? parseInt(sp.get('pagina')!) : 1;
  const todas = sp.get('todas') === '1';
  try {
    if (todas) {
      const r = await listarNotasEntradaTodas({ mes, ano, nf, fornecedor, descricao }, conta);
      return NextResponse.json(r);
    }
    const r = await listarNotasEntrada({ mes, ano, nf, fornecedor, descricao, pagina }, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
