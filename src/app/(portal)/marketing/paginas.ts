// =============================================================================
// FONTE ÚNICA das páginas do módulo Marketing & Eventos.
//
// Alimenta ao mesmo tempo:
//   - a sub-nav (components/marketing/MarketingNav.tsx)
//   - o gate por tela (marketing/layout.tsx, via lib/permissoes/marketing.ts)
//   - o catálogo de permissões (lib/permissoes/catalogo.ts -> ACOES_POR_MODULO.marketing)
//
// Adicionar uma tela = editar SÓ este arquivo. (Mesmo padrão do PAGINAS_FROTA.)
//
// ⚠️ Só liste aqui páginas que EXISTEM — a sub-nav renderiza um link pra cada
// uma, e um link pra rota inexistente vira 404.
// =============================================================================

export type GrupoMkt = 'Início' | 'Gestão' | 'Resultado';

export interface PaginaMkt {
  key: string;   // 'marketing:<slug>' — o slug é o que vai pra permissão
  label: string;
  href: string;
  grupo: GrupoMkt;
}

export const GRUPOS_MKT: GrupoMkt[] = ['Início', 'Gestão', 'Resultado'];

export const PAGINAS_MARKETING: PaginaMkt[] = [
  { key: 'marketing:dashboard',  label: 'Ações',         href: '/marketing',            grupo: 'Início' },
  // Apoio de fábrica: a carteira consolidada da verba co-op (prazo de
  // contrapartida, processo NF/ND/OC). É o que destrava dinheiro parado.
  { key: 'marketing:apoios',     label: 'Apoio Fábrica', href: '/marketing/apoios',     grupo: 'Gestão' },
  { key: 'marketing:custos',     label: 'Investimento',  href: '/marketing/custos',     grupo: 'Gestão' },
  { key: 'marketing:leads',      label: 'Leads',         href: '/marketing/leads',      grupo: 'Gestão' },
  { key: 'marketing:resultados', label: 'Resultados',    href: '/marketing/resultados', grupo: 'Resultado' },
];

/** 'marketing:apoios' -> 'apoios' */
export function slugDaPagina(p: PaginaMkt): string {
  return p.key.slice('marketing:'.length);
}
