import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { listarArquivos } from '@/lib/ajustes/mahindra';

export const dynamic = 'force-dynamic';

// GET: historico (20 mais recentes) dos arquivos gerados, por conta.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const arquivos = await listarArquivos(conta);
    return NextResponse.json({ arquivos });
  } catch (e) {
    return NextResponse.json({ arquivos: [], erro: (e as Error).message }, { status: 500 });
  }
}
