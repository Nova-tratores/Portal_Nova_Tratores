// Fonte única das páginas do módulo Ajustes: usada pelo submenu interno
// (AjustesNav), pelas permissões por página (chave 'ajustes:<x>') e pelo
// registro no admin (MODULOS). Etapa 2: ao mover uma página para outro modulo,
// a chave 'ajustes:<x>' acompanha (renomeia-se aqui e no admin).

export type GrupoAjustes = 'Início' | 'Edição' | 'Visualização' | 'Informação';

// Departamento: divisor gráfico do submenu (o nav agrupa por isto).
export type Departamento = 'Financeiro' | 'Estoque' | 'Venda';

export interface PaginaAjustes {
  key: string; // chave de permissao (temAcesso)
  label: string;
  href: string;
  grupo: GrupoAjustes;         // mantido (ordenação/histórico); o nav agrupa por `departamento`
  departamento: Departamento;
}

export const GRUPOS_AJUSTES: GrupoAjustes[] = ['Início', 'Edição', 'Visualização', 'Informação'];

// Ordem + estilo do divisor de cada departamento no AjustesNav.
export interface DepartamentoInfo { key: Departamento; label: string; icon: string; cor: string; corBg: string }
export const DEPARTAMENTOS: DepartamentoInfo[] = [
  { key: 'Financeiro', label: 'Financeiro', icon: '💰', cor: '#047857', corBg: '#ecfdf5' },
  { key: 'Estoque', label: 'Estoque', icon: '🏭', cor: '#1d4ed8', corBg: '#eff6ff' },
  { key: 'Venda', label: 'Venda', icon: '🛒', cor: '#b45309', corBg: '#fffbeb' },
];

export const PAGINAS_AJUSTES: PaginaAjustes[] = [
  { key: 'ajustes:dashboard', label: 'Dashboard CMC', href: '/ajustes', grupo: 'Início', departamento: 'Estoque' },
  // Edição
  { key: 'ajustes:ajuste-custos', label: 'Ajuste de custos', href: '/ajustes/ajuste-custos', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:correcao-contas', label: 'Correção de contas', href: '/ajustes/correcao-contas', grupo: 'Edição', departamento: 'Financeiro' },
  { key: 'ajustes:devolucao', label: 'Devolução de compra', href: '/ajustes/devolucao', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:baixa-contas', label: 'Baixar contas', href: '/ajustes/baixa-contas', grupo: 'Edição', departamento: 'Financeiro' },
  { key: 'ajustes:inventario', label: 'Inventário rotativo', href: '/ajustes/inventario', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:inventario-contagem', label: 'Contagem', href: '/ajustes/inventario/contagem', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:caracteristicas', label: 'Características', href: '/ajustes/caracteristicas', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:localizacao', label: 'Localização física', href: '/ajustes/localizacao', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:familias', label: 'Famílias', href: '/ajustes/familias', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:descricoes', label: 'Descrições', href: '/ajustes/descricoes', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:catalogo-caract', label: 'Sistema/Sub-sistema', href: '/ajustes/catalogo-caracteristicas', grupo: 'Edição', departamento: 'Estoque' },
  { key: 'ajustes:omie-massa', label: 'Omie em massa', href: '/ajustes/omie-massa', grupo: 'Edição', departamento: 'Estoque' },
  // Visualização
  { key: 'ajustes:negativos', label: 'Estoque negativo', href: '/ajustes/negativos', grupo: 'Visualização', departamento: 'Estoque' },
  { key: 'ajustes:recebimentos', label: 'Recebimentos pendentes', href: '/ajustes/recebimentos', grupo: 'Visualização', departamento: 'Estoque' },
  { key: 'ajustes:pedidos', label: 'Pedidos abertos', href: '/ajustes/pedidos', grupo: 'Visualização', departamento: 'Venda' },
  { key: 'ajustes:remessas', label: 'Remessas em aberto', href: '/ajustes/remessas', grupo: 'Visualização', departamento: 'Estoque' },
  // 'movimentacao-produto' migrou para o módulo Estoque (chave 'estoque:movimentacao-produto').
  { key: 'ajustes:antecipacoes', label: 'Antecipações', href: '/ajustes/antecipacoes', grupo: 'Visualização', departamento: 'Financeiro' },
  { key: 'ajustes:notas', label: 'Notas fiscais', href: '/ajustes/notas', grupo: 'Visualização', departamento: 'Venda' },
  { key: 'ajustes:mahindra', label: 'Arquivo Mahindra', href: '/ajustes/mahindra', grupo: 'Visualização', departamento: 'Estoque' },
  // Informação
  { key: 'ajustes:alertas', label: 'Alertas', href: '/ajustes/alertas', grupo: 'Informação', departamento: 'Estoque' },
  { key: 'ajustes:saude-mensal', label: 'Saúde mensal', href: '/ajustes/saude-mensal', grupo: 'Informação', departamento: 'Financeiro' },
  { key: 'ajustes:historico', label: 'Histórico', href: '/ajustes/historico', grupo: 'Informação', departamento: 'Estoque' },
];
