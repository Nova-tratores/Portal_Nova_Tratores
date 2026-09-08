/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// MARKETING & EVENTOS — casca das rotas de API.
//
// Toda rota /api/marketing/* passa por aqui: valida o token, checa o módulo (ou
// a ação granular) e traduz erro em resposta. Evita repetir o mesmo bloco de
// guarda em ~20 arquivos e garante que o gate do servidor não fique diferente
// do gate da tela por esquecimento.
// =============================================================================
import { NextResponse } from 'next/server';
import { autenticar, type Autenticado } from '@/lib/auth/server';
import { temModuloMarketing, temModuloLead, podeMarketing } from './server';
import { migrationFaltou, MSG_MIGRATION } from './db';

export type Guard = 'marketing' | 'lead';

/**
 * Autentica e autoriza. Devolve `{ auth }` ou `{ resposta }` já pronta pra
 * retornar da rota.
 *
 * `acao` (opcional) exige a permissão granular — use nas ESCRITAS. Sem ela,
 * basta ter acesso ao módulo (leitura).
 */
export async function guardar(
  req: Request,
  guard: Guard,
  acao?: string,
): Promise<{ auth: Autenticado; resposta?: never } | { auth?: never; resposta: NextResponse }> {
  const auth = await autenticar(req);
  if (!auth) {
    return { resposta: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }

  const temModulo = guard === 'lead' ? temModuloLead(auth) : temModuloMarketing(auth);
  if (!temModulo) {
    return { resposta: NextResponse.json({ error: 'Sem permissão para este módulo' }, { status: 403 }) };
  }

  if (acao && !podeMarketing(auth, acao)) {
    return {
      resposta: NextResponse.json(
        { error: `Sem permissão para esta ação (${acao})` },
        { status: 403 },
      ),
    };
  }

  return { auth };
}

/**
 * Erro -> resposta. Migration pendente vira 503 com a instrução (não 500 com
 * stack), porque é situação esperada: o SQL roda à mão e o deploy é automático.
 */
export function erroResposta(e: any, contexto: string): NextResponse {
  if (migrationFaltou(e)) {
    return NextResponse.json({ error: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
  }
  console.error(`[marketing] ${contexto}:`, e);
  return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 });
}

/** Só as chaves permitidas, e sem undefined — evita gravar lixo do body. */
export function apenas<T extends Record<string, any>>(body: any, chaves: readonly string[]): T {
  const out: Record<string, any> = {};
  for (const k of chaves) {
    if (body && Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined) {
      out[k] = body[k] === '' ? null : body[k];
    }
  }
  return out as T;
}

/** Número ou null — '' e lixo viram null em vez de NaN no banco. */
export function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Data ISO (YYYY-MM-DD) ou null. */
export function dataOuNull(v: any): string | null {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
