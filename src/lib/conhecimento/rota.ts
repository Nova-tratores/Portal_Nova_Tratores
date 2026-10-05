/* eslint-disable @typescript-eslint/no-explicit-any */
// BASE DE CONHECIMENTO — casca das rotas /api/conhecimento/*.
// Ler = qualquer usuário logado (o filtro por módulo/categoria é por artigo).
// Editar/publicar = admin, ação do módulo `conhecimento` ou responsável do módulo
// do artigo (kb_responsaveis). As regras em si são puras: lib/conhecimento/artigos.ts.

import { NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { MSG_MIGRATION, migrationFaltou, nomeDoUsuario, responsaveis, type Autor } from "./db";
import { podeEditar, podePublicar, type Quem, type Responsaveis } from "./artigos";

export interface Sessao {
  quem: Quem;
  autor: Autor;
  resp: Responsaveis;
  respNomes: Record<string, string>;
}

export async function entrar(req: Request): Promise<{ sessao: Sessao; resposta?: never } | { sessao?: never; resposta: NextResponse }> {
  const auth = await autenticar(req);
  if (!auth) return { resposta: NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 }) };
  try {
    const [{ porModulo, nomes }, nome] = await Promise.all([responsaveis(), nomeDoUsuario(auth.userId, auth.email)]);
    return {
      sessao: {
        quem: { userId: auth.userId, isAdmin: auth.isAdmin, modulos: auth.modulos, categoria: auth.categoria },
        autor: { id: auth.userId, nome },
        resp: porModulo,
        respNomes: nomes,
      },
    };
  } catch (e) {
    return { resposta: erroResposta(e, "sessão") };
  }
}

/** Pode editar ALGUM módulo (para mostrar o botão "Novo artigo" e a fila). */
export function editaAlgo(s: Sessao): boolean {
  return podeEditar(s.quem, "__nenhum__", s.resp) || Object.values(s.resp).includes(s.quem.userId);
}
export const podeEditarModulo = (s: Sessao, modulo: string) => podeEditar(s.quem, modulo, s.resp);
export const podePublicarModulo = (s: Sessao, modulo: string) => podePublicar(s.quem, modulo, s.resp);

export function negado(msg = "Sem permissão para esta ação"): NextResponse {
  return NextResponse.json({ ok: false, erro: msg }, { status: 403 });
}

/** Migration pendente vira 503 com a instrução; erro com `.http` respeita o status. */
export function erroResposta(e: any, contexto: string): NextResponse {
  if (migrationFaltou(e)) return NextResponse.json({ ok: false, erro: MSG_MIGRATION, migracaoFaltando: true }, { status: 503 });
  const http = Number(e?.http);
  if (http >= 400 && http < 500) return NextResponse.json({ ok: false, erro: e.message }, { status: http });
  console.error(`[conhecimento] ${contexto}:`, e);
  return NextResponse.json({ ok: false, erro: e?.message || "Erro inesperado" }, { status: 500 });
}
