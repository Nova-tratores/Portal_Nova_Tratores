// Ações EXPLÍCITAS: o "acesso total" ao módulo (módulo puro em modulos_permitidos)
// NÃO as concede — só quem recebe a ação marcada no Admin (ou admin/dev).
// São atos que saem da empresa e não se desfazem (ex.: emitir nota fiscal).
//
// Arquivo pequeno e sem dependências de propósito: é lido pelo usePermissoes
// (navegador), pelas rotas (servidor) e pelo catálogo do Admin.
export const ACOES_EXPLICITAS: ReadonlySet<string> = new Set([
  'pos:faturar', // faturar a OS (emite NFS-e) — decisão do José, 10/10/2026
  'pos:modelos_fiscais', // criar/editar modelos fiscais da NFS-e e vincular a clientes
]);

export function acaoExplicita(modulo: string, acao?: string): boolean {
  return !!acao && ACOES_EXPLICITAS.has(`${modulo}:${acao}`);
}

/** Mesma regra do pode() do usePermissoes, respeitando as ações explícitas. */
export function permite(
  perms: string[], isAdmin: boolean, modulo: string, acao?: string,
): boolean {
  if (isAdmin) return true;
  if (acaoExplicita(modulo, acao)) return perms.includes(`${modulo}:${acao}`);
  if (perms.includes(modulo)) return true;
  if (!acao) return perms.some((p) => p.startsWith(modulo + ':'));
  return perms.includes(`${modulo}:${acao}`);
}
