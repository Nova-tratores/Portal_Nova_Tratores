import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { urlDanfe } from '@/lib/ajustes/notas';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// URL do PDF da nota (DANFE de NF-e ou PDF da NFS-e via tipo=servico). Por
// padrão retorna { url } (o front abre); com ?redirect=1 redireciona direto.
// Telas: Notas fiscais (ajustes), Dashboard de Vendas e Rastreio (financeiro).
// Exige login: as telas buscam o { url } com o token e abrem a URL da Omie.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [
    { modulo: 'ajustes', acao: 'notas' },
    { modulo: 'estoque', acao: 'dashboard' },
    { modulo: 'financeiro', acao: 'rastreio' },
  ]);
  if (g.resposta) return g.resposta;
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
