// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================

export function normalizarStatus(st: string | null | undefined): string {
  if (!st) return "Orçamento";
  const s = st.trim();

  // Status exatos das fases POS — retorna direto
  const fasesValidas = [
    "Orçamento",
    "Orçamento enviado para o cliente e aguardando",
    "Execução",
    "Execução (Realizando Diagnóstico)",
    "Execução aguardando peças (em transporte)",
    "Executada aguardando comercial",
    "Aguardando outros",
    "Aguardando ordem Técnico",
    "Relatório Concluído",
    "Enviado Omie",
    "Concluída",
    "Cancelada",
  ];
  const match = fasesValidas.find(f => f.toLowerCase() === s.toLowerCase());
  if (match) return match;

  // Fallback para status legados do PPV
  const sl = s.toLowerCase();
  if (sl.includes("faturar")) return "Executada aguardando comercial";
  if (sl === "em andamento" || sl.includes("andamento") || sl.includes("saída")) return "Execução";
  if (sl === "aguardando" || sl.includes("aberto")) return "Orçamento";
  if (sl === "fechado" || sl.includes("concluido") || sl.includes("concluída")) return "Concluída";
  if (sl === "cancelado" || sl.includes("cancelada")) return "Cancelada";
  return "Orçamento";
}

export function formatarDataFrontend(valor: string | null | undefined): string {
  if (!valor) return "";
  const str = String(valor);
  if (str.includes("-")) {
    const parts = str.split(/[-T ]/);
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMoedaSemSimbolo(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}
