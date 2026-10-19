import { NextRequest, NextResponse } from 'next/server';
import { iniciarVerificacao } from '@/lib/ajustes/verificacao';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dispara a verificacao diaria em background (worker-ready: job 'verificacao-diaria').
// 202 = iniciou; 409 = ja ha uma rodando.
export async function POST(req: NextRequest) {
  // Botão "Rodar agora" da tela /ajustes/alertas. Autor sai do login, não do corpo.
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'alertas' }]);
  if (g.resposta) return g.resposta;
  try {
    const r = await iniciarVerificacao(autorDe(g.user));
    return NextResponse.json(r, { status: r.jaRodando ? 409 : 202 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
