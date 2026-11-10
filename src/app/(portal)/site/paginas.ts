// FONTE ÚNICA das telas do módulo Site (Comercial, José 10/11/2026): abas, gate do layout e catálogo de permissões.
export interface PaginaSite { key: string; label: string; href: string }

export const PAGINAS_SITE: PaginaSite[] = [
  { key: 'site:pedidos', label: 'Pedidos do site', href: '/site' },
  { key: 'site:catalogo', label: 'Catálogo do site', href: '/site/catalogo' },
  { key: 'site:acessos', label: 'Acessos', href: '/site/acessos' },
  { key: 'site:conteudo', label: 'Conteúdo e publicar', href: '/site/conteudo' },
]

export const slugDaPaginaSite = (p: PaginaSite) => p.key.slice('site:'.length)

export function slugDaRotaSite(pathname: string): string {
  const resto = pathname.replace(/^\/site\/?/, '').split('/')[0]
  return resto || 'pedidos'
}

export function podeTelaSite(perms: string[], isAdmin: boolean, slug: string): boolean {
  return isAdmin || perms.includes('site') || perms.includes(`site:${slug}`) || perms.some((p) => p.startsWith(`site:${slug}:`))
}
