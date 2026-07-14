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
  { key: 'frota:dashboard',          label: 'Visão geral',       href: '/frota',                    grupo: 'Início' },
  { key: 'frota:abastecimento',      label: 'Abastecimento',     href: '/frota/abastecimento',      grupo: 'Custos' },
  { key: 'frota:abastecimento:flex', label: 'Álcool × Gasolina', href: '/frota/abastecimento/flex', grupo: 'Custos' },
  // Próximas fases: veiculos, patio, documentos, mapa, paradas, multas,
  // manutencoes, custos. Entram aqui conforme forem construídas.
];

/** 'frota:abastecimento:flex' -> 'abastecimento:flex' */
export function slugDaPagina(p: PaginaFrota): string {
  return p.key.slice('frota:'.length);
}
