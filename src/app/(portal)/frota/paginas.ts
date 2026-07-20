// =============================================================================
// FONTE ÚNICA das páginas do módulo Frota.
//
// Alimenta ao mesmo tempo:
//   - a sub-nav (FrotaNav.tsx)
//   - o gate por tela (frota/layout.tsx)
//   - o catálogo de permissões (lib/permissoes/catalogo.ts -> ACOES_POR_MODULO.frota)
//
// Adicionar uma tela = editar SÓ este arquivo. (Mesmo padrão do PAGINAS_AJUSTES.)
//
// ⚠️ Só liste aqui páginas que EXISTEM — a sub-nav renderiza um link pra cada
// uma, e um link pra rota inexistente vira 404.
// =============================================================================

export type GrupoFrota = 'Início' | 'Cadastro' | 'Operação' | 'Custos';

export interface PaginaFrota {
  key: string;    // 'frota:<slug>' — o slug é o que vai pra permissão
  label: string;
  href: string;
  grupo: GrupoFrota;
}

export const GRUPOS_FROTA: GrupoFrota[] = ['Início', 'Cadastro', 'Operação', 'Custos'];

export const PAGINAS_FROTA: PaginaFrota[] = [
  // A Visão geral É a tela de veículos (fundidas em 15/07, decisão do usuário):
  // KPIs de saúde da frota + grid completo com a Ficha. /frota/veiculos virou
  // redirect; quem tem a chave frota:veiculos entra via compat.ts.
  { key: 'frota:dashboard',          label: 'Visão geral',       href: '/frota',                    grupo: 'Início' },
  // Pátio NÃO tem tela (decisão do usuário, 13/07): o rótulo de localização nos
  // cards de Veículos substituiu o grid arrastável; o valor FIPE é editado na
  // Ficha do Veículo (via /api/visual-estoque/frota/dados — o DRE continua
  // lendo Placas.valor_mercado normalmente).
  // Documentos NÃO têm tela própria (decisão do usuário): vivem na Ficha do
  // Veículo. A ação frota:documentos:editar (nas extras) controla a escrita.
  // Motoristas: funcionários do RH (Supabase próprio, sem salário) + CNH e
  // vínculos da frota. Só CNH/flag motorista editáveis aqui — o cadastro é do RH.
  { key: 'frota:motoristas',         label: 'Motoristas',        href: '/frota/motoristas',         grupo: 'Cadastro' },
  { key: 'frota:mapa',               label: 'Mapa',              href: '/frota/mapa',               grupo: 'Operação' },
  { key: 'frota:paradas',            label: 'Paradas',           href: '/frota/paradas',            grupo: 'Operação' },
  { key: 'frota:multas',             label: 'Multas',            href: '/frota/multas',             grupo: 'Operação' },
  { key: 'frota:manutencoes',        label: 'Manutenções',       href: '/frota/manutencoes',        grupo: 'Operação' },
  { key: 'frota:abastecimento',      label: 'Abastecimento',     href: '/frota/abastecimento',      grupo: 'Custos' },
  { key: 'frota:abastecimento:flex', label: 'Álcool × Gasolina', href: '/frota/abastecimento/flex', grupo: 'Custos' },
  { key: 'frota:custos',             label: 'Custos (TCO)',      href: '/frota/custos',             grupo: 'Custos' },
];

/** 'frota:abastecimento:flex' -> 'abastecimento:flex' */
export function slugDaPagina(p: PaginaFrota): string {
  return p.key.slice('frota:'.length);
}
