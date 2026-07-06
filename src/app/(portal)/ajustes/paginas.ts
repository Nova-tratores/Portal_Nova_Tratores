// Fonte única das páginas do módulo Ajustes: usada pelo submenu interno
// (AjustesNav), pelas permissões por página (chave 'ajustes:<x>') e pelo
// registro no admin (MODULOS). Etapa 2: ao mover uma página para outro modulo,
// a chave 'ajustes:<x>' acompanha (renomeia-se aqui e no admin).

export type GrupoAjustes = 'Início' | 'Edição' | 'Visualização' | 'Informação';

export interface PaginaAjustes {
  key: string; // chave de permissao (temAcesso)
  label: string;
  href: string;
  grupo: GrupoAjustes;
}

export const GRUPOS_AJUSTES: GrupoAjustes[] = ['Início', 'Edição', 'Visualização', 'Informação'];

export const PAGINAS_AJUSTES: PaginaAjustes[] = [
  { key: 'ajustes:dashboard', label: 'Dashboard CMC', href: '/ajustes', grupo: 'Início' },
  // Edição
  { key: 'ajustes:ajuste-custos', label: 'Ajuste de custos', href: '/ajustes/ajuste-custos', grupo: 'Edição' },
  { key: 'ajustes:correcao-contas', label: 'Correção de contas', href: '/ajustes/correcao-contas', grupo: 'Edição' },
  { key: 'ajustes:baixa-contas', label: 'Baixar contas', href: '/ajustes/baixa-contas', grupo: 'Edição' },
  { key: 'ajustes:inventario', label: 'Inventário rotativo', href: '/ajustes/inventario', grupo: 'Edição' },
  { key: 'ajustes:inventario-contagem', label: 'Contagem', href: '/ajustes/inventario/contagem', grupo: 'Edição' },
  { key: 'ajustes:caracteristicas', label: 'Características', href: '/ajustes/caracteristicas', grupo: 'Edição' },
  // Visualização
  { key: 'ajustes:negativos', label: 'Estoque negativo', href: '/ajustes/negativos', grupo: 'Visualização' },
  { key: 'ajustes:recebimentos', label: 'Recebimentos pendentes', href: '/ajustes/recebimentos', grupo: 'Visualização' },
  { key: 'ajustes:pedidos', label: 'Pedidos abertos', href: '/ajustes/pedidos', grupo: 'Visualização' },
  { key: 'ajustes:remessas', label: 'Remessas em aberto', href: '/ajustes/remessas', grupo: 'Visualização' },
  { key: 'ajustes:movimentacao-produto', label: 'Movimentação de produto', href: '/ajustes/movimentacao-produto', grupo: 'Visualização' },
  { key: 'ajustes:notas', label: 'Notas fiscais', href: '/ajustes/notas', grupo: 'Visualização' },
  { key: 'ajustes:mahindra', label: 'Arquivo Mahindra', href: '/ajustes/mahindra', grupo: 'Visualização' },
  // Informação
  { key: 'ajustes:alertas', label: 'Alertas', href: '/ajustes/alertas', grupo: 'Informação' },
  { key: 'ajustes:saude-mensal', label: 'Saúde mensal', href: '/ajustes/saude-mensal', grupo: 'Informação' },
  { key: 'ajustes:historico', label: 'Histórico', href: '/ajustes/historico', grupo: 'Informação' },
];
