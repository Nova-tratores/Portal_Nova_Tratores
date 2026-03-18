// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================

export function normalizarStatus(st: string | null | undefined): string {
  if (!st) return "Aguardando";
  const s = st.toLowerCase();
  if (s.includes("faturar")) return "Aguardando Para Faturar";
  if (s.includes("aberto") || s.includes("aguardando")) return "Aguardando";
  if (s.includes("andamento") || s.includes("saída")) return "Em Andamento";
  if (s.includes("fechado") || s.includes("concluido")) return "Fechado";
  if (s.includes("cancelado")) return "Cancelado";
  return "Aguardando";
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
