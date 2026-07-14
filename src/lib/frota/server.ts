// Autorização do módulo Frota no SERVIDOR. Espelha o gate do cliente
// (lib/permissoes/frota.ts) — se divergirem, a tela mostra o botão e a rota
// nega (ou pior: o contrário).
import type { Autenticado } from '@/lib/auth/server';

/** Tem acesso ao módulo (o módulo puro OU qualquer permissão granular dele). */
export function temModuloFrota(auth: Autenticado): boolean {
  if (auth.isAdmin) return true;
  return (
    auth.modulos.includes('frota') ||
    auth.modulos.some((m) => m.startsWith('frota:'))
  );
}

/**
 * Pode executar a ação/ver a tela. Match por PREFIXO: quem tem
 * `frota:abastecimento:upload` também passa em `podeFrota(auth,'abastecimento')`
 * — senão seria barrado na própria tela que pode usar.
 */
export function podeFrota(auth: Autenticado, acao: string): boolean {
  if (auth.isAdmin) return true;
  if (auth.modulos.includes('frota')) return true;
  return (
    auth.modulos.includes(`frota:${acao}`) ||
    auth.modulos.some((m) => m.startsWith(`frota:${acao}:`))
  );
}
