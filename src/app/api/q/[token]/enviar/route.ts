/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/q/<token>/enviar — o respondente avisa que terminou.
//
// Marca a data e SÓ. Não trava a edição de propósito: quem fecha o questionário
// é um admin, pra pessoa poder lembrar de algo no dia seguinte e completar.
import { NextResponse } from 'next/server';
import { enviar, ErroQuestionario, migrationFaltou } from '@/lib/marketing/questionario-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mensagem própria: quem chega aqui está esperando ESTA migration, não a do módulo.
const MSG_MIGRACAO =
  'As tabelas do questionário ainda não existem no banco. Rode sql/marketing-questionario.sql no SQL Editor do Supabase.';

const STATUS: Record<string, number> = {
  link_invalido: 404, link_expirado: 410, link_fechado: 423, muito_rapido: 429,
};

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    return NextResponse.json(await enviar(token));
  } catch (e: any) {
    if (e instanceof ErroQuestionario) {
      return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: STATUS[e.codigo] ?? 400 });
    }
    if (migrationFaltou(e)) {
      return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
    }
    console.error('[questionario] enviar:', e);
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 });
  }
}
