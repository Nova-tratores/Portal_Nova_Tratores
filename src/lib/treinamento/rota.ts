/* eslint-disable @typescript-eslint/no-explicit-any */
// TREINAMENTO — casca das rotas /api/treinamento/*.
// Fazer trilha = qualquer usuário logado. Gerir (criar/editar trilhas e perguntas, atribuir,
// painel da equipe) = admin, módulo `treinamento` (ação `gerir`) ou responsável do módulo
// da trilha na base de conhecimento (kb_responsaveis).

import { NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { nomeDoUsuario, responsaveis } from "@/lib/conhecimento/db";
import { MSG_MIGRATION, migrationFaltou, type Autor } from "./server";

export interface SessaoLms {
  userId: string;
  isAdmin: boolean;
  categoria: string | null;
  autor: Autor;
  /** módulos em que gere trilhas; null = todos (admin ou módulo treinamento) */
  gere: string[] | null;
}

export async function guardarTreinamento(req: Request): Promise<{ sessao: SessaoLms; resposta?: never } | { sessao?: never; resposta: NextResponse }> {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 }) };
  try {
    const [{ porModulo }, nome] = await Promise.all([responsaveis().catch(() => ({ porModulo: {} as Record<string, string> })), nomeDoUsuario(auth.userId, auth.email)]);
    const tudo = auth.isAdmin || auth.modulos.includes("treinamento") || auth.modulos.includes("treinamento:gerir");
    const gere = tudo ? null : Object.keys(porModulo).filter((m) => porModulo[m] === auth.userId);
    return { sessao: { userId: auth.userId, isAdmin: auth.isAdmin, categoria: auth.categoria, autor: { id: auth.userId, nome }, gere } };
  } catch (e) {
    return { resposta: erroResposta(e, "sessão") };
  }
}

export const gereAlgo = (s: SessaoLms) => s.gere === null || s.gere.length > 0;
export const gereModulo = (s: SessaoLms, modulo: string) => s.gere === null || s.gere.includes(modulo);

export function negado(msg = "Sem permissão para esta ação"): NextResponse {
  return NextResponse.json({ ok: false, erro: msg }, { status: 403 });
}

export function erroResposta(e: any, contexto: string): NextResponse {
  if (migrationFaltou(e)) return NextResponse.json({ ok: false, erro: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
  const http = Number(e?.http);
  if (http >= 400 && http < 500) return NextResponse.json({ ok: false, erro: e.message }, { status: http });
  console.error(`[treinamento] ${contexto}:`, e);
  return NextResponse.json({ ok: false, erro: e?.message || "Erro inesperado" }, { status: 500 });
}
