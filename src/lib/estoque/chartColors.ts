// Tokens de cor do bloco "Peças + Serviços" — fonte ÚNICA, consumida tanto pelo
// gráfico quanto pelos cards, para a legenda do gráfico casar com as bordas dos
// cards. Regra: vermelho é reservado para VARIAÇÃO NEGATIVA (não para faturamento).
export const chartColors = {
  pecas: '#1e40af', // azul escuro (peças)
  servicos: '#0d9488', // verde-água escuro (serviços) — bordas/textos legíveis
  servicosBar: '#2dd4bf', // verde-água claro (preenchimento de barra de serviços)
  consolidado: '#111827', // neutro escuro (Peças + Serviços)
  entradas: '#7c3aed', // terciário distinto (Entradas / Comprei) — violeta
  neg: '#dc2626', // variação negativa
  pos: '#16a34a', // variação positiva
} as const;
