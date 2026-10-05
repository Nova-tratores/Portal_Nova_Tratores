// BASE DE CONHECIMENTO — rótulos dos módulos (client-safe).
// O piloto é o Pós-Vendas; os demais entram aqui conforme ganharem artigos.

export const MODULOS_KB: { id: string; rotulo: string; cor: string }[] = [
  { id: "pos", rotulo: "Pós-Vendas (OS)", cor: "#0369a1" },
  { id: "garantias", rotulo: "Garantias", cor: "#0ea5e9" },
  { id: "revisoes", rotulo: "Controle de Revisões", cor: "#b91c1c" },
  { id: "sat", rotulo: "SAT Digital", cor: "#0891b2" },
  { id: "ppv", rotulo: "Peças (PPV)", cor: "#ea580c" },
  { id: "requisicoes", rotulo: "Requisições", cor: "#f97316" },
  { id: "feedbacks", rotulo: "Feedbacks & CRM", cor: "#d97706" },
  { id: "tickets", rotulo: "Tickets", cor: "#0e7490" },
  { id: "geral", rotulo: "Geral do portal", cor: "#475569" },
];

export function rotuloModulo(id: string): string {
  return MODULOS_KB.find((m) => m.id === id)?.rotulo ?? id;
}
export function corModulo(id: string): string {
  return MODULOS_KB.find((m) => m.id === id)?.cor ?? "#475569";
}
