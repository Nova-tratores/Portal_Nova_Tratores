import { NextRequest, NextResponse } from 'next/server';
import { listarMotivos, registrarContato, type ContatoInput } from '@/lib/estoque/inteligencia-comercial';

export const dynamic = 'force-dynamic';

// GET -> { motivos } (domínio, para o <select> do form de contato).
export async function GET() {
  try {
    return NextResponse.json({ motivos: await listarMotivos() });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

// POST -> registra um contato (desfecho). Autor vem do body (userProfile do client).
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ContatoInput;
    const r = await registrarContato(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
