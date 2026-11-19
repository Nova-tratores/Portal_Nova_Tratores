// =============================================================================
// FONTE ÚNICA das telas do módulo Controle Marketing.
//
// 18/11/2026 (José): o antigo módulo Site (/site) e o Marketing & Eventos viraram
// UM módulo só — "Controle Marketing" — com dois grupos de guias:
//   - Redes sociais: pedidos e catálogo do site, promoções, acessos, conteúdo, campanhas
//   - Eventos: ações, apoio de fábrica, investimento, leads, resultados
//
// Alimenta ao mesmo tempo:
//   - a faixa de guias (components/marketing/MarketingNav.tsx)
//   - o gate por tela (marketing/layout.tsx, via lib/permissoes/marketing.ts)
//   - o catálogo de permissões (lib/permissoes/catalogo.ts -> ACOES_POR_MODULO.marketing)
//   - as rotas da v2 (lib/permissoes/telas.ts)
//
// Adicionar uma tela = editar SÓ este arquivo.
// ⚠️ Só liste aqui páginas que EXISTEM — a faixa renderiza um link pra cada uma.
// =============================================================================

export type GrupoMkt = 'Redes sociais' | 'Eventos';

export interface PaginaMkt {
  key: string;   // 'marketing:<slug>' — o slug é o que vai pra permissão
  label: string;
  href: string;
  grupo: GrupoMkt;
}

export const GRUPOS_MKT: GrupoMkt[] = ['Redes sociais', 'Eventos'];

export const PAGINAS_MARKETING: PaginaMkt[] = [
  // ── Redes sociais (era o módulo Site) ──
  { key: 'marketing:pedidos',    label: 'Pedidos do site',     href: '/marketing/pedidos',    grupo: 'Redes sociais' },
  { key: 'marketing:catalogo',   label: 'Catálogo do site',    href: '/marketing/catalogo',   grupo: 'Redes sociais' },
  { key: 'marketing:promocoes',  label: 'Promoções',           href: '/marketing/promocoes',  grupo: 'Redes sociais' },
  { key: 'marketing:acessos',    label: 'Acessos',             href: '/marketing/acessos',    grupo: 'Redes sociais' },
  { key: 'marketing:conteudo',   label: 'Conteúdo e publicar', href: '/marketing/conteudo',   grupo: 'Redes sociais' },
  // A roleta (Black Friday…) abre de DENTRO da campanha (botão "Abrir a roleta"); fica aqui só pela permissão
  { key: 'marketing:campanhas',  label: 'Roleta das campanhas', href: '/marketing/campanhas',  grupo: 'Redes sociais' },
  // ── Eventos (era o Marketing & Eventos) ──
  // 18/11/2026: Ação virou Campanha — uma lista só, da mais antiga para a mais nova, com capa
  { key: 'marketing:dashboard',  label: 'Campanhas',           href: '/marketing',            grupo: 'Eventos' },
  // Apoio de fábrica: a carteira consolidada da verba co-op (prazo de
  // contrapartida, processo NF/ND/OC). É o que destrava dinheiro parado.
  { key: 'marketing:apoios',     label: 'Apoio Fábrica',       href: '/marketing/apoios',     grupo: 'Eventos' },
  { key: 'marketing:custos',     label: 'Investimento',        href: '/marketing/custos',     grupo: 'Eventos' },
  { key: 'marketing:leads',      label: 'Leads',               href: '/marketing/leads',      grupo: 'Eventos' },
  { key: 'marketing:resultados', label: 'Resultados',          href: '/marketing/resultados', grupo: 'Eventos' },
];

// Guias da faixa: cada guia junta uma ou mais telas (12/11/2026, José: "pedidos do
// site e catálogo ficam no mesmo lugar"). A permissão continua por tela.
export interface AbaMkt { label: string; telas: string[]; grupo: GrupoMkt }
export const ABAS_MARKETING: AbaMkt[] = [
  ...[
    { label: 'Pedidos e catálogo', telas: ['marketing:pedidos', 'marketing:catalogo'] },
    { label: 'Promoções', telas: ['marketing:promocoes'] },
    { label: 'Acessos', telas: ['marketing:acessos'] },
    { label: 'Conteúdo e publicar', telas: ['marketing:conteudo'] },
  ].map((a) => ({ ...a, grupo: 'Redes sociais' as GrupoMkt })),
  ...PAGINAS_MARKETING.filter((p) => p.grupo === 'Eventos')
    // a guia Campanhas fica acesa também dentro da roleta (/marketing/campanhas)
    .map((p) => ({ label: p.label, telas: p.key === 'marketing:dashboard' ? [p.key, 'marketing:campanhas'] : [p.key], grupo: 'Eventos' as GrupoMkt })),
];

/** 'marketing:apoios' -> 'apoios' */
export function slugDaPagina(p: PaginaMkt): string {
  return p.key.slice('marketing:'.length);
}

/** Grupo de um slug de tela ('pedidos' -> 'Redes sociais'). */
export function grupoDoSlug(slug: string): GrupoMkt | undefined {
  return PAGINAS_MARKETING.find((p) => slugDaPagina(p) === slug)?.grupo;
}
