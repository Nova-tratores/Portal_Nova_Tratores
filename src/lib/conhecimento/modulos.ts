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
// Módulos fora do piloto (o aviso diário cobre todos): cor própria para o ícone em quadradinho.
const COR_EXTRA: Record<string, string> = {
  frota: "#1e40af", pendencias: "#1e40af", mapa: "#1e40af", financeiro: "#15803d", dre: "#15803d",
  estoque: "#64748b", "consulta-estoque": "#64748b", ajustes: "#64748b", clientes: "#7c3aed",
  propostas: "#dc2626", "gestao-vendas": "#dc2626", "inteligencia-vendas": "#dc2626", "vendas-modelo": "#dc2626",
  marketing: "#db2777", lead: "#db2777", mecanicos: "#0369a1", "painel-mecanicos": "#0369a1", lousa: "#0369a1",
  "fotos-tecnicos": "#0369a1", orcamentos: "#ea580c", opa: "#ca8a04", "opa-pecas": "#ca8a04", patrimonio: "#ca8a04",
  tarefas: "#0e7490", cronograma: "#0e7490", "dashboard-agro": "#16a34a", tratorilson: "#2563eb",
};

// Ícone do Font Awesome 6 de cada módulo (sem ícone próprio: livro).
const ICONE: Record<string, string> = {
  pos: "fa-tractor", garantias: "fa-shield-halved", revisoes: "fa-clipboard-check", sat: "fa-headset",
  ppv: "fa-gears", requisicoes: "fa-file-invoice-dollar", feedbacks: "fa-comments", tickets: "fa-list-check",
  pops: "fa-book-open", geral: "fa-house", frota: "fa-truck", pendencias: "fa-triangle-exclamation",
  mapa: "fa-map-location-dot", financeiro: "fa-sack-dollar", dre: "fa-chart-line", estoque: "fa-boxes-stacked",
  "consulta-estoque": "fa-warehouse", ajustes: "fa-sliders", clientes: "fa-folder-open", propostas: "fa-file-signature",
  "gestao-vendas": "fa-handshake", "inteligencia-vendas": "fa-lightbulb", "vendas-modelo": "fa-chart-column",
  marketing: "fa-bullhorn", lead: "fa-address-card", mecanicos: "fa-user-gear", "painel-mecanicos": "fa-user-gear",
  lousa: "fa-chalkboard", "fotos-tecnicos": "fa-camera", orcamentos: "fa-calculator", opa: "fa-circle-exclamation",
  "opa-pecas": "fa-box-open", patrimonio: "fa-tags", tarefas: "fa-square-check", cronograma: "fa-calendar-days",
  "dashboard-agro": "fa-seedling", tratorilson: "fa-robot", conhecimento: "fa-book", atividades: "fa-chart-simple",
};

export function corModulo(id: string): string {
  return MODULOS_KB.find((m) => m.id === id)?.cor ?? COR_EXTRA[id] ?? "#475569";
}
export function iconeModulo(id: string): string {
  return ICONE[id] ?? "fa-book";
}
