import { NextRequest, NextResponse } from 'next/server';
import { obterArquivo } from '@/lib/ajustes/mahindra';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: baixa um arquivo historico especifico (le o base64 do Supabase).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, erro: 'id invalido' }, { status: 400 });
  }
  try {
    const arq = await obterArquivo(id);
    if (!arq) {
      return NextResponse.json({ ok: false, erro: 'Arquivo nao encontrado.' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(arq.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${arq.filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
