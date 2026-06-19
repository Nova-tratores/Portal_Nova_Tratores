import { NextRequest, NextResponse } from 'next/server';
import { parseTemplate } from '@/lib/ajustes/mahindra';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST: recebe o XLSX bruto no corpo da requisicao -> headers + amostra.
export async function POST(req: NextRequest) {
  try {
    const ab = await req.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ ok: false, erro: 'Nenhum arquivo recebido. Envie o .xlsx como corpo bruto da requisicao.' }, { status: 400 });
    }
    const r = parseTemplate(buffer);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 400 });
  }
}
