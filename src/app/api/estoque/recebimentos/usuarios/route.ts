import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarUsuarios, upsertUsuario } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/recebimentos-omie (pode('estoque','recebimentos-omie')).
const OPCOES = [{ modulo: 'estoque', acao: 'recebimentos-omie' }];

// Lista de gente p/ transferência. Portado de GET /api/recebimentos/usuarios (server.js:7697).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  try {
    const usuarios = await listarUsuarios(conta);
    return NextResponse.json({ usuarios, meuEmail: sp.get('meu') || '' });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

// Cadastra/atualiza um usuário. Portado de POST /api/recebimentos/usuarios (server.js:7709).
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const body = (await req.json().catch(() => ({}))) as { nome?: string; email?: string; ativo?: boolean };
    if (!body.nome) return NextResponse.json({ erro: 'nome obrigatorio' }, { status: 400 });
    await upsertUsuario(conta, body.nome, body.email || null, body.ativo !== false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
