// FONTE ÚNICA das telas do módulo Site (Comercial, José 10/11/2026): abas, gate do layout e catálogo de permissões.
export interface PaginaSite { key: string; label: string; href: string }

export const PAGINAS_SITE: PaginaSite[] = [
  { key: 'site:pedidos', label: 'Pedidos do site', href: '/site' },
  { key: 'site:catalogo', label: 'Catálogo do site', href: '/site/catalogo' },
  { key: 'site:promocoes', label: 'Promoções', href: '/site/promocoes' },
  { key: 'site:acessos', label: 'Acessos', href: '/site/acessos' },
  { key: 'site:conteudo', label: 'Conteúdo e publicar', href: '/site/conteudo' },
  { key: 'site:campanhas', label: 'Campanhas', href: '/site/campanhas' },
]

// Guias da faixa vermelha (12/11/2026, José: "pedidos do site e catálogo ficam no mesmo lugar"; o módulo controla
// site + redes). Cada guia junta telas; a permissão continua por tela (PAGINAS_SITE).
export interface AbaSite { label: string; telas: string[] }
export const ABAS_SITE: AbaSite[] = [
  { label: 'Pedidos e catálogo', telas: ['site:pedidos', 'site:catalogo'] },
  { label: 'Promoções', telas: ['site:promocoes'] },
  { label: 'Acessos', telas: ['site:acessos'] },
  { label: 'Conteúdo e publicar', telas: ['site:conteudo'] },
  // 13/11/2026, José: campanhas (Black Friday 2026…) separadas por nome e ano, com os cadastros e fotos
  { label: 'Campanhas', telas: ['site:campanhas'] },
]

export const slugDaPaginaSite = (p: PaginaSite) => p.key.slice('site:'.length)

export function slugDaRotaSite(pathname: string): string {
  const resto = pathname.replace(/^\/site\/?/, '').split('/')[0]
  return resto || 'pedidos'
}

export function podeTelaSite(perms: string[], isAdmin: boolean, slug: string): boolean {
  return isAdmin || perms.includes('site') || perms.includes(`site:${slug}`) || perms.some((p) => p.startsWith(`site:${slug}:`))
}
