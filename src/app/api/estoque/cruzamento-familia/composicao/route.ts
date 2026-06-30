import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { composicao, type ComposicaoFiltro } from '@/lib/estoque/cruzamento-familia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/estoque/cruzamento-familia/composicao
//   ?fonte=estoque|entrada|saida&mes=&ano=&grupo=peca|maquina&categoria=&familia=&conta=
// Lista os itens que compõem o valor de uma célula (popup de drill-down).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fonteRaw = sp.get('fonte') || '';
  const fonte = (['estoque', 'entrada', 'saida'].includes(fonteRaw) ? fonteRaw : 'estoque') as ComposicaoFiltro['fonte'];
  const conta = parseConta(sp.get('conta'));

  const grupoRaw = sp.get('grupo') || '';
  const f: ComposicaoFiltro = {
    fonte,
    mes: sp.get('mes') ? parseInt(sp.get('mes')!) : undefined,
    ano: sp.get('ano') ? parseInt(sp.get('ano')!) : undefined,
    grupo: grupoRaw === 'peca' || grupoRaw === 'maquina' ? grupoRaw : undefined,
    categoria: sp.get('categoria') || undefined,
    familia: sp.get('familia') || undefined,
  };

  if ((fonte === 'entrada' || fonte === 'saida') && (!f.mes || !f.ano)) {
    return NextResponse.json({ erro: 'Informe mes e ano' }, { status: 400 });
  }

  try {
    const r = await composicao(conta, f);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
