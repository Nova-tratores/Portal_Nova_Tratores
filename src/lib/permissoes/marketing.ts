// =============================================================================
// Gate por TELA do módulo Marketing & Eventos (cliente).
//
// Por que não usar `pode('marketing', slug)` cru: `pode` faz match EXATO em
// modulos_permitidos, e as ações do módulo têm dois níveis
// ('marketing:apoios:editar'). Quem tivesse SÓ `marketing:apoios:editar` seria
// barrado na tela `apoios` — justamente a que pode usar. Aqui o match é por
// PREFIXO. Espelho servidor: lib/marketing/server.ts (se divergirem, a tela
// mostra o botão e a rota nega).
// =============================================================================
import { PAGINAS_MARKETING } from '@/app/(portal)/marketing/paginas';

/** Slugs válidos de tela: 'dashboard', 'apoios', 'custos', 'leads', 'resultados'. */
export const SLUGS_MARKETING = new Set(
  PAGINAS_MARKETING.map((p) => p.key.slice('marketing:'.length)),
);

/**
 * URL -> slug de tela.
 *   /marketing                 -> 'dashboard'  (a landing)
 *   /marketing/apoios          -> 'apoios'
 *   /marketing/<uuid da ação>  -> 'dashboard'  (a FICHA herda a tela de ações)
 */
export function slugDaRota(pathname: string): string {
  if (!pathname.startsWith('/marketing')) return '';
  const partes = pathname.slice('/marketing'.length).split('/').filter(Boolean);
  if (partes.length === 0) return 'dashboard';
  // A ficha de uma ação (/marketing/<id>) não é uma tela do catálogo: quem
  // pode ver a lista pode abrir a ficha.
  if (!SLUGS_MARKETING.has(partes[0])) return 'dashboard';
  return partes[0];
}

/**
 * Pode ver a tela? admin/dev -> tudo; módulo puro -> tudo; senão bate a chave
 * exata OU qualquer chave ABAIXO dela (é isso que salva o caso do :editar).
 */
export function podeTelaMarketing(
  perms: string[],
  isAdmin: boolean,
  slug: string,
): boolean {
  if (isAdmin) return true;
  if (perms.includes('marketing')) return true;
  if (!slug) return false;
  return (
    perms.includes(`marketing:${slug}`) ||
    perms.some((p) => p.startsWith(`marketing:${slug}:`))
  );
}
