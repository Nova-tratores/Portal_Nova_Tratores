// Helper compartilhado pra determinar a "origem" dos dados de uma oportunidade.
// Usado tanto no OportunidadeCard quanto no handleAtender pra rotular onde
// veio o cliente: Omie (NOVA/CASTRO) ou tabela tratores (controle interno).

import type { Oportunidade } from "./types";

export function origemDaOportunidade(op: Oportunidade): string {
  const d = op.detalhes || {};
  const empresa = (d.ultimo_pedido_empresa || d.ultima_os_empresa) as string | null | undefined;
  if (empresa) return `Omie ${String(empresa).toUpperCase()}`;
  if (d.ultima_os_fonte === "portal") return "Portal (interno)";
  if (op.codigo_omie) return "Omie";
  // Fallback: cliente vem da tabela `tratores` (controle interno) e nao
  // achamos correspondencia no Omie. Pode ser cadastro com nome errado.
  return "Tratores (Portal)";
}
