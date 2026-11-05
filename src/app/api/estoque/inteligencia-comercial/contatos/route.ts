import { NextRequest, NextResponse } from 'next/server';
import { listarMotivos, registrarContato, type ContatoInput } from '@/lib/estoque/inteligencia-comercial';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesma regra da tela /estoque/inteligencia-comercial: pode('estoque', 'inteligencia-comercial').
const ACESSO = [{ modulo: 'estoque', acao: 'inteligencia-comercial' }];

// GET -> { motivos } (domínio, para o <select> do form de contato).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    return NextResponse.json({ motivos: await listarMotivos() });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

// POST -> registra um contato (desfecho). Autor vem SEMPRE do login, nunca do body.
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    const body = (await req.json()) as ContatoInput;
    const r = await registrarContato({ ...body, autor_id: g.user.id, autor_nome: autorDe(g.user) });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
