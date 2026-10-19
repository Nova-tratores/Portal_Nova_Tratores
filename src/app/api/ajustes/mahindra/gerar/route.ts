import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { iniciarGeracao } from '@/lib/ajustes/mahindra';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST: body { templateBase64, mes } -> inicia a geracao em background (202).
// O autor (criadoPor) sai do login.
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'mahindra' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const body = (await req.json().catch(() => ({}))) as {
    templateBase64?: string;
    mes?: string;
  };
  try {
    const r = await iniciarGeracao(conta, {
      templateBase64: body.templateBase64 || '',
      mes: body.mes || '',
      criadoPor: autorDe(g.user),
      baseUrl: req.nextUrl.origin,
    });
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 400 });
  }
}
