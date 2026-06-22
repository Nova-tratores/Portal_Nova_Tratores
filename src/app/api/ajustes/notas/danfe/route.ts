import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { urlDanfe } from '@/lib/ajustes/notas';

export const dynamic = 'force-dynamic';

// URL do PDF da nota (DANFE de NF-e ou PDF da NFS-e via tipo=servico). Por
// padrão retorna { url } (o front abre); com ?redirect=1 redireciona direto.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const nCodNF = sp.get('nCodNF');
  if (nCodNF == null || nCodNF === '') {
    return NextResponse.json({ erro: 'informe nCodNF' }, { status: 400 });
  }
  try {
    const { url, validadeAte } = await urlDanfe(conta, nCodNF, sp.get('tipo') || 'produto');
    if (sp.get('redirect') === '1') return NextResponse.redirect(url);
    return NextResponse.json({ url, validadeAte });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
