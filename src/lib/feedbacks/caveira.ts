"use client";
// A "caveira" (tag "Não contatar") num lugar só, para o CRM/RFM, a fila em
// modo lista e a ficha do cockpit aplicarem a MESMA regra:
//  - marcar: tag na pasta do cliente (+ opcionalmente INATIVAR o cadastro no
//    Omie) e registro no audit_log;
//  - reativar: tira a tag (+ reativa no Omie se havia código) e registra.
// Quem chama decide a confirmação (ModalConfirmarCaveira / confirm) e o
// tratamento de erro.

import { definirInativoOmie, upsertClienteInfo } from "@/lib/feedbacks/api";
import { TAG_NAO_CONTATAR, type ClienteInfo } from "@/lib/feedbacks/types";

export interface AlvoCaveira {
  clienteKey: string;
  codigoOmie: string | null;
  nome: string;
  tagsAtuais: string[];
}

export type LogFn = (params: { sistema: string; acao: string; entidade: string; entidade_id: string; entidade_label: string; detalhes?: Record<string, unknown> }) => unknown;

export function temCaveira(tags: string[] | null | undefined): boolean {
  return (tags || []).includes(TAG_NAO_CONTATAR);
}

export async function marcarNaoContatar(alvo: AlvoCaveira, inativarOmie: boolean, log?: LogFn): Promise<ClienteInfo> {
  const novas = temCaveira(alvo.tagsAtuais) ? alvo.tagsAtuais : [...alvo.tagsAtuais, TAG_NAO_CONTATAR];
  if (inativarOmie && alvo.codigoOmie) await definirInativoOmie(alvo.codigoOmie, true);
  const salvo = await upsertClienteInfo({ cliente_key: alvo.clienteKey, codigo_omie: alvo.codigoOmie, nome: alvo.nome, tags: novas });
  void log?.({
    sistema: "feedbacks",
    acao: inativarOmie ? "inativar_omie" : "nao_contatar",
    entidade: "cliente",
    entidade_id: alvo.clienteKey,
    entidade_label: alvo.nome,
    detalhes: { tag: TAG_NAO_CONTATAR, inativou_omie: inativarOmie },
  });
  return salvo;
}

export async function reativarContato(alvo: AlvoCaveira, log?: LogFn): Promise<ClienteInfo> {
  const novas = alvo.tagsAtuais.filter((t) => t !== TAG_NAO_CONTATAR);
  const temOmie = !!alvo.codigoOmie;
  if (temOmie) await definirInativoOmie(alvo.codigoOmie as string, false);
  const salvo = await upsertClienteInfo({ cliente_key: alvo.clienteKey, codigo_omie: alvo.codigoOmie, nome: alvo.nome, tags: novas });
  void log?.({
    sistema: "feedbacks",
    acao: "reativar_contato",
    entidade: "cliente",
    entidade_id: alvo.clienteKey,
    entidade_label: alvo.nome,
    detalhes: { reativou_omie: temOmie },
  });
  return salvo;
}
