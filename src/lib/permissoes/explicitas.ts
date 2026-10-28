// Ações EXPLÍCITAS: o "acesso total" ao módulo (módulo puro em modulos_permitidos)
// NÃO as concede — só quem recebe a ação marcada no Admin (ou admin/dev).
// São atos que saem da empresa e não se desfazem (ex.: emitir nota fiscal).
//
// Arquivo pequeno e sem dependências de propósito: é lido pelo usePermissoes
// (navegador), pelas rotas (servidor) e pelo catálogo do Admin.
export const ACOES_EXPLICITAS: ReadonlySet<string> = new Set([
  'pos:faturar', // faturar a OS (emite NFS-e) — decisão do José, 10/10/2026
  'pos:cancelar_faturamento', // cancelar NFS-e/NF-e pelo portal (13/10/2026)
  'pos:substituir_omie', // trocar a OS/pedido do Omie (cancela o antigo) (13/10/2026)
  'pos:modelos_fiscais', // criar/editar modelos fiscais da NFS-e e vincular a clientes
  // editar os cards dos kanbans do Financeiro (nome, condição, valor, datas) em
  // qualquer fase — antes só admin; o "acesso total" ao Financeiro NÃO dá (13/10/2026)
  'financeiro:editar_cards',
  // tirar o carro da frota (vender, arquivar, marcar sem uso) — só Dev concede (22/10/2026)
  'frota:veiculos:inativar',
]);

// Ações FISCAIS de Dev (José, 13/10/2026): no começo só os Devs fazem; admin comum
// NÃO ganha automaticamente, e só um Dev concede a outra pessoa (Admin + rota).
export const ACOES_SO_DEV: ReadonlySet<string> = new Set([
  'pos:faturar',
  'pos:cancelar_faturamento',
  'pos:substituir_omie',
  'frota:veiculos:inativar',
]);

export function acaoSoDev(modulo: string, acao?: string): boolean {
  return !!acao && ACOES_SO_DEV.has(`${modulo}:${acao}`);
}

export function acaoExplicita(modulo: string, acao?: string): boolean {
  return !!acao && ACOES_EXPLICITAS.has(`${modulo}:${acao}`);
}

/** Mesma regra do pode() do usePermissoes, respeitando as ações explícitas. */
export function permite(
  perms: string[], isAdmin: boolean, modulo: string, acao?: string, isDev = false,
): boolean {
  // fiscal de Dev: Dev sempre; os demais (inclusive admin) só com a ação marcada
  if (acaoSoDev(modulo, acao)) return isDev || perms.includes(`${modulo}:${acao}`);
  if (isAdmin) return true;
  if (acaoExplicita(modulo, acao)) return perms.includes(`${modulo}:${acao}`);
  if (perms.includes(modulo)) return true;
  if (!acao) return perms.some((p) => p.startsWith(modulo + ':'));
  return perms.includes(`${modulo}:${acao}`);
}
