import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { listarVendas } from '@/lib/estoque/comissao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const sp = req.nextUrl.searchParams;
  const mes = sp.get('mes') ? parseInt(sp.get('mes')!, 10) : null;
  const ano = sp.get('ano') ? parseInt(sp.get('ano')!, 10) : null;
  if (!mes || !ano) return NextResponse.json({ erro: 'mes e ano obrigatorios' }, { status: 400 });
  const comComissao = sp.get('com_comissao');
  try {
    const r = await listarVendas(conta, mes, ano, {
      vendedor: sp.get('vendedor'),
      familia: sp.get('familia'),
      grupo: sp.get('grupo'),
      comComissaoOnly: comComissao === '1' || comComissao === 'true',
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
