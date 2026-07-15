// =============================================================================
// Gate por TELA do módulo Frota.
//
// Por que não usar `pode('frota', slug)` cru:
//   `pode` faz match EXATO em `modulos_permitidos`. As telas do Frota têm slug
//   com dois níveis ('abastecimento:flex') e há ações abaixo delas
//   ('abastecimento:upload'). Quem tivesse SÓ `frota:abastecimento:upload`
//   seria barrado na tela `abastecimento` — justamente a que pode usar.
//   Aqui o match é por PREFIXO.
// =============================================================================
import { PAGINAS_FROTA } from '@/app/(portal)/frota/paginas';

/** Slugs válidos de tela: 'dashboard', 'abastecimento', 'abastecimento:flex'... */
export const SLUGS_FROTA = new Set(
  PAGINAS_FROTA.map((p) => p.key.slice('frota:'.length)),
);

/**
 * URL -> slug de tela.
 *   /frota                      -> 'dashboard'  (a landing)
 *   /frota/abastecimento        -> 'abastecimento'
 *   /frota/abastecimento/flex   -> 'abastecimento:flex'  (existe no catálogo)
 *   /frota/abastecimento/lotes  -> 'abastecimento'       (não existe -> herda o pai)
 */
export function slugDaRota(pathname: string): string {
  if (!pathname.startsWith('/frota')) return '';
  const partes = pathname.slice('/frota'.length).split('/').filter(Boolean);
  if (partes.length === 0) return 'dashboard';

  // /frota/veiculos é redirect pra Visão geral (aba fundida em 15/07) — o
  // bookmark antigo tem que passar pelo gate da tela unificada, não por um
  // slug que já não existe.
  if (partes[0] === 'veiculos') return 'dashboard';

  const doisNiveis = partes.slice(0, 2).join(':');
  if (SLUGS_FROTA.has(doisNiveis)) return doisNiveis;
  return partes[0];
}

/**
 * Pode ver a tela? admin/dev -> tudo; módulo puro -> tudo; senão bate a chave
 * exata OU qualquer chave ABAIXO dela (é isso que salva o caso do :upload).
 */
export function podeTelaFrota(
  perms: string[],
  isAdmin: boolean,
  slug: string,
): boolean {
  if (isAdmin) return true;
  if (perms.includes('frota')) return true;
  if (!slug) return false;
  return (
    perms.includes(`frota:${slug}`) ||
    perms.some((p) => p.startsWith(`frota:${slug}:`))
  );
}
