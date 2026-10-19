// =============================================================================
// FONTE ÚNICA das telas do módulo Inteligência de Vendas.
// Alimenta a barra de guias (IVNav), o gate por tela (layout) e o catálogo de
// permissões (ACOES_POR_MODULO['inteligencia-vendas'] e telas.ts).
// Adicionar uma tela = editar SÓ este arquivo.
// =============================================================================

export interface PaginaIV {
  key: string; // 'inteligencia-vendas:<slug>'
  label: string;
  href: string;
}

export const PAGINAS_IV: PaginaIV[] = [
  { key: 'inteligencia-vendas:oportunidades', label: 'Oportunidades', href: '/inteligencia-vendas' },
  { key: 'inteligencia-vendas:noticias', label: 'Notícias', href: '/inteligencia-vendas/noticias' },
  { key: 'inteligencia-vendas:retorno', label: 'Sem retorno', href: '/inteligencia-vendas/retorno' },
  { key: 'inteligencia-vendas:equipe', label: 'Equipe', href: '/inteligencia-vendas/equipe' },
  { key: 'inteligencia-vendas:municipios', label: 'Municípios', href: '/inteligencia-vendas/municipios' },
  { key: 'inteligencia-vendas:calculadora', label: 'Calculadora', href: '/inteligencia-vendas/calculadora' },
  { key: 'inteligencia-vendas:indicacoes', label: 'Indicações', href: '/inteligencia-vendas/indicacoes' },
  { key: 'inteligencia-vendas:concorrencia', label: 'Concorrência', href: '/inteligencia-vendas/concorrencia' },
  { key: 'inteligencia-vendas:empresas', label: 'Empresas (CNPJ)', href: '/inteligencia-vendas/empresas' },
];

export const slugDaPaginaIV = (p: PaginaIV) => p.key.slice('inteligencia-vendas:'.length);

/** URL → slug ('/inteligencia-vendas' → 'oportunidades'). */
export function slugDaRotaIV(pathname: string): string {
  const resto = pathname.replace(/^\/inteligencia-vendas\/?/, '').split('/')[0];
  if (!resto) return 'oportunidades';
  if (resto === 'teste') return 'oportunidades'; // página de opções (mesma permissão da tela principal)
  const p = PAGINAS_IV.find((x) => slugDaPaginaIV(x) === resto);
  return p ? resto : '';
}

/** admin → tudo; módulo inteiro → tudo; senão a chave da tela ou alguma abaixo dela. */
export function podeTelaIV(perms: string[], isAdmin: boolean, slug: string): boolean {
  if (isAdmin || perms.includes('inteligencia-vendas')) return true;
  if (!slug) return false;
  return perms.includes(`inteligencia-vendas:${slug}`) || perms.some((p) => p.startsWith(`inteligencia-vendas:${slug}:`));
}
