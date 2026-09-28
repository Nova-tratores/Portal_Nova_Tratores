/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// AGRO (Inteligência Agrícola por CAR) — casca das rotas /api/agro/*.
//
// As tabelas agro_* têm RLS ON sem policy: só o service role lê/escreve, e o
// usuário SEMPRE vem do token (autenticar). O gate é a mesma permissão da
// página /dashboard-agro (módulo 'dashboard-agro'); 'agro*' fica reservado pra
// quando o módulo ganhar permissão própria.
// =============================================================================
import { NextResponse } from 'next/server';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { registrarAuditLog } from '@/lib/server/audit-notify';

export const SISTEMA_AGRO = 'dashboard-agro';

export function temAcessoAgro(auth: Autenticado): boolean {
  return auth.isAdmin || auth.modulos.includes('dashboard-agro') || auth.modulos.some((m) => m.startsWith('agro'));
}

export async function guardarAgro(
  req: Request,
): Promise<{ auth: Autenticado; resposta?: never } | { auth?: never; resposta: NextResponse }> {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!temAcessoAgro(auth)) return { resposta: NextResponse.json({ error: 'Sem permissão para o Dashboard Agro' }, { status: 403 }) };
  return { auth };
}

export async function nomeDoUsuario(auth: Autenticado): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
    if (data?.nome) return String(data.nome);
  } catch { /* fallback abaixo */ }
  return auth.email || 'Usuário do portal';
}

/** Audit log best-effort (LIA: quem consultou/exportou/decidiu fica registrado). */
export async function logAgro(
  auth: Autenticado,
  p: { acao: string; entidade?: string; entidadeId?: string; entidadeLabel?: string; detalhes?: Record<string, unknown> },
): Promise<void> {
  try {
    await registrarAuditLog({ userId: auth.userId, userName: await nomeDoUsuario(auth), sistema: SISTEMA_AGRO, ...p });
  } catch (e) {
    console.warn('[agro] audit log falhou:', e);
  }
}

/** Erro → resposta. Tabela/função agro_* ausente vira 503 com instrução, não 500 com stack. */
export function erroAgro(e: any, contexto: string, migration = 'sql/agro-schema.sql'): NextResponse {
  const m = String(e?.message || e || '');
  if (/agro_/.test(m) && /does not exist|not find|schema cache/i.test(m)) {
    return NextResponse.json({ error: `Migration ${migration} não aplicada (${m.slice(0, 120)})`, migracaoFaltando: true }, { status: 503 });
  }
  console.error(`[agro] ${contexto}:`, e);
  return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
}

/** cod_car vem na URL: só letras, dígitos e hífen (vai dentro de filtros do PostgREST). */
export function codCarValido(s: string): boolean {
  return /^[A-Z]{2}-\d{7}-[A-Z0-9]{8,40}$/i.test(s);
}
