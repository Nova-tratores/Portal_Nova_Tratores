// Tela: o servidor recusou "Concluída" porque a OS não foi faturada no Omie
// (trava-concluida.ts). Mostra o porquê e pede o motivo para concluir mesmo assim.
// Devolve o motivo escrito, ou null se a pessoa desistiu.
export function pedirMotivoConcluir(erro: string): string | null {
  const m = window.prompt(
    `${erro}\n\nPara concluir SEM faturar, escreva o motivo (fica na história da OS).\nPara faturar, clique em Cancelar e use o botão Faturar da OS.`,
  );
  if (m == null) return null;
  const t = m.trim();
  return t || null;
}
