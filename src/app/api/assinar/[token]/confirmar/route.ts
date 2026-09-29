// PÚBLICO (só o token): grava a assinatura do cliente na OS. Uma vez só.
import { NextRequest, NextResponse } from 'next/server';
import { ErroAssinatura, assinar } from '@/lib/pos/assinatura-cliente-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const png = String(body.png || '');
    if (!png.startsWith('data:image/png;base64,')) return NextResponse.json({ error: 'assinatura inválida' }, { status: 400 });
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const a = await assinar(token, png, body.nome ? String(body.nome) : null, ip, { geo: body.geo, dispositivo: body.dispositivo });
    return NextResponse.json({ ok: true, assinadoEm: a.assinado_em });
  } catch (e) {
    if (e instanceof ErroAssinatura) {
      const st = e.codigo === 'ja_assinado' ? 409 : e.codigo === 'tabela_ausente' ? 503 : 404;
      return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: st });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
