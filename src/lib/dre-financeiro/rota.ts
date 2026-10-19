// Guarda das rotas /api/dre-financeiro/* (tema 1 da auditoria, 19/10/2026).
//
// Espelha o gate das TELAS do DRE (app/(portal)/dre-financeiro/layout.js):
//   - módulo: temAcesso('financeiro') || temAcesso('dre')
//   - tela <slug>: temAcesso('financeiro') || pode('dre', slug)
// A rota de uma subpágina aceita o 'financeiro' OU 'dre' puro OU 'dre:<slug>' de
// QUALQUER tela que a chama (rota usada por duas telas passa os dois slugs).
// Vendas por Modelo também é tela do Comercial (VendasModelo.js, variante
// 'comercial'): aceita ainda o módulo próprio 'vendas-modelo'.
import { protegerRota, type OpcaoAcesso } from '@/lib/ajustes/permissao-server'
import { protegerRotaOuInterna } from '@/lib/auth/chamada-interna'

/** Opções do protegerRota para as telas dadas (sem tela = Home do módulo). */
export function opcoesDre(...telas: string[]): OpcaoAcesso[] {
  if (telas.length === 0) return [{ modulo: 'financeiro' }, { modulo: 'dre' }]
  return [{ modulo: 'financeiro' }, ...telas.map((t) => ({ modulo: 'dre', acao: t }))]
}

/** Vendas por Modelo: DRE (financeiro | dre:vendas-modelo) OU o módulo do Comercial. */
export const OPCOES_VENDAS_MODELO: OpcaoAcesso[] = [{ modulo: 'vendas-modelo' }, ...opcoesDre('vendas-modelo')]

/** Rota chamada pela(s) tela(s) do DRE. */
export function guardarDre(req: Request, ...telas: string[]) {
  return protegerRota(req, opcoesDre(...telas))
}

/** Rota que também é chamada pelo servidor (fetchInterno). */
export function guardarDreOuInterna(req: Request, ...telas: string[]) {
  return protegerRotaOuInterna(req, opcoesDre(...telas))
}

/** Rota de Vendas por Modelo (DRE + Comercial). */
export function guardarDreVendasModelo(req: Request) {
  return protegerRota(req, OPCOES_VENDAS_MODELO)
}

/** Sync/backfill/debug sem tela que os chame: só admin/dev. */
export function guardarDreAdmin(req: Request) {
  return protegerRota(req, [{ admin: true }])
}
