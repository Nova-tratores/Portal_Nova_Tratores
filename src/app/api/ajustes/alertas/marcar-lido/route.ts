import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { marcarLido } from '@/lib/ajustes/verificacao';

export const dynamic = 'force-dynamic';

// Marca alertas como lido/nao-lido. Body: { ids?: number[], conta?, lido }.
// Sem ids -> marca TODOS (opcionalmente filtrando por conta).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    ids?: Array<number | string>;
    id?: number | string;
    conta?: string;
    lido?: boolean;
  };
  const ids = Array.isArray(body.ids) ? body.ids : body.id != null ? [body.id] : [];
  const conta = parseConta(body.conta);
  try {
    const r = await marcarLido({ ids, conta, lido: body.lido });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
