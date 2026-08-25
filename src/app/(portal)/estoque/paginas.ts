// Fonte única das páginas do módulo Estoque: usada pelo submenu interno
// (EstoqueNav) e pelo registro de permissões (ACOES_POR_MODULO.estoque em
// src/lib/permissoes/catalogo.ts, que faz .map desta lista). `key` é o slug da
// rota, também a chave de permissão: pode('estoque', key).
// A home /estoque (busca de produto) é o landing e não entra como item.

export interface GrupoInfo { key: string; label: string; icon: string; cor: string; corBg: string }

// Ordem + estilo do divisor de cada grupo no EstoqueNav.
export const GRUPOS_ESTOQUE: GrupoInfo[] = [
  { key: 'consulta', label: 'Consulta', icon: '🔎', cor: '#1d4ed8', corBg: '#eff6ff' },
  { key: 'entradas', label: 'Entradas', icon: '📥', cor: '#047857', corBg: '#ecfdf5' },
  { key: 'analise', label: 'Análise', icon: '📊', cor: '#b45309', corBg: '#fffbeb' },
  { key: 'admin', label: 'Admin', icon: '⚙️', cor: '#6d28d9', corBg: '#f5f3ff' },
];

export interface PaginaEstoque {
  key: string;   // slug da rota = chave de permissão (pode('estoque', key))
  label: string;
  href: string;
  grupo: string; // uma das GRUPOS_ESTOQUE.key
}

export const PAGINAS_ESTOQUE: PaginaEstoque[] = [
  // Consulta
  { key: 'dashboard', label: 'Dashboard de Vendas', href: '/estoque/dashboard', grupo: 'consulta' },
  { key: 'cadastro-produto', label: 'Cadastro de Produto', href: '/estoque/cadastro-produto', grupo: 'consulta' },
  { key: 'movimentacao-produto', label: 'Movimentação de Produto', href: '/estoque/movimentacao-produto', grupo: 'consulta' },
  // Entradas
  { key: 'notas-entrada', label: 'Notas de Entrada', href: '/estoque/notas-entrada', grupo: 'entradas' },
  { key: 'recebimentos', label: 'Recebimentos', href: '/estoque/recebimentos', grupo: 'entradas' },
  { key: 'recebimentos-omie', label: 'Recebimentos (Omie)', href: '/estoque/recebimentos-omie', grupo: 'entradas' },
  // Análise
  { key: 'curva-abc', label: 'Curva ABC', href: '/estoque/curva-abc', grupo: 'analise' },
  { key: 'giro-estoque', label: 'Giro de Estoque', href: '/estoque/giro-estoque', grupo: 'analise' },
  { key: 'cruzamento-familia', label: 'Cruzamento por Família', href: '/estoque/cruzamento-familia', grupo: 'analise' },
  { key: 'comissao', label: 'Comissão', href: '/estoque/comissao', grupo: 'analise' },
  // Admin
  { key: 'admin', label: 'Admin', href: '/estoque/admin', grupo: 'admin' },
  { key: 'admin-cmc', label: 'Admin CMC', href: '/estoque/admin-cmc', grupo: 'admin' },
  { key: 'ignorar-clientes', label: 'Ignorar Clientes', href: '/estoque/ignorar-clientes', grupo: 'admin' },
];
