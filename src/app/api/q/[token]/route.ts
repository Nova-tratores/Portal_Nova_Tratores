/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// ROTA PÚBLICA do questionário. SEM LOGIN — o token é a credencial.
//
// GET   /api/q/<token>  -> dados do questionário + respostas já salvas
// PATCH /api/q/<token>  -> grava (merge campo a campo)
//
// O que impede abuso: o token é 32 bytes aleatórios (não enumerável), a rota
// aceita SÓ as chaves q01..q26 com teto de tamanho, e há um piso de 1 segundo
// entre gravações. A chave anônima não chega às tabelas: RLS sem policy.
// =============================================================================
import { NextResponse } from 'next/server';
import {
  porToken, salvar, ErroQuestionario, migrationFaltou,
} from '@/lib/marketing/questionario-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mensagem própria: quem chega aqui está esperando ESTA migration, não a do módulo.
const MSG_MIGRACAO =
  'As tabelas do questionário ainda não existem no banco. Rode sql/marketing-questionario.sql no SQL Editor do Supabase.';

const STATUS: Record<string, number> = {
  link_invalido: 404,
  link_expirado: 410,
  link_fechado: 423,
  muito_rapido: 429,
};

function tratar(e: any, contexto: string): NextResponse {
  if (e instanceof ErroQuestionario) {
    return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: STATUS[e.codigo] ?? 400 });
  }
  if (migrationFaltou(e)) {
    return NextResponse.json({ error: MSG_MIGRACAO, migracaoFaltando: true }, { status: 503 });
  }
  console.error(`[questionario] ${contexto}:`, e);
  return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    return NextResponse.json(await porToken(token), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return tratar(e, 'GET');
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const corpo = await req.json().catch(() => ({}));
    return NextResponse.json(await salvar(token, corpo?.respostas));
  } catch (e) {
    return tratar(e, 'PATCH');
  }
}
