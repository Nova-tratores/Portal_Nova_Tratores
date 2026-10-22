// BASE DE CONHECIMENTO — rótulos dos módulos (client-safe).
// O piloto é o Pós-Vendas; os demais entram aqui conforme ganharem artigos.

import { MODULOS_TELAS } from "@/lib/permissoes/telas";

export const MODULOS_KB: { id: string; rotulo: string; cor: string }[] = [
  { id: "pos", rotulo: "Pós-Vendas (OS)", cor: "#0369a1" },
  { id: "garantias", rotulo: "Garantias", cor: "#0ea5e9" },
  { id: "revisoes", rotulo: "Controle de Revisões", cor: "#b91c1c" },
  { id: "sat", rotulo: "SAT Digital", cor: "#0891b2" },
  { id: "ppv", rotulo: "Peças (PPV)", cor: "#ea580c" },
  { id: "requisicoes", rotulo: "Requisições", cor: "#f97316" },
  { id: "feedbacks", rotulo: "Feedbacks & CRM", cor: "#d97706" },
  { id: "tickets", rotulo: "Tickets", cor: "#0e7490" },
  { id: "pops", rotulo: "Procedimentos (POP)", cor: "#0f766e" },
  { id: "geral", rotulo: "Geral do portal", cor: "#475569" },
];

export function rotuloModulo(id: string): string {
  // demais módulos do portal (aviso diário de novidades cobre todos): nome do Admin
  return MODULOS_KB.find((m) => m.id === id)?.rotulo
    ?? (id === "patrimonio" ? "Patrimônio Loja" : MODULOS_TELAS.find((m) => m.id === id)?.nome)
    ?? id;
}
export function corModulo(id: string): string {
  return MODULOS_KB.find((m) => m.id === id)?.cor ?? "#475569";
}
