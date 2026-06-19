import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { iniciarGeracao } from '@/lib/ajustes/mahindra';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST: body { templateBase64, mes, criadoPor } -> inicia a geracao em background (202).
export async function POST(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  const body = (await req.json().catch(() => ({}))) as {
    templateBase64?: string;
    mes?: string;
    criadoPor?: string;
  };
  try {
    const r = await iniciarGeracao(conta, {
      templateBase64: body.templateBase64 || '',
      mes: body.mes || '',
      criadoPor: body.criadoPor,
    });
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 400 });
  }
}
