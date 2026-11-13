// Dashboard por setor (José, 10/11/2026 — escolhida a "Opção 6" da página de teste).
// Cada módulo mora em UM setor. O que serve a mais de um setor vai para "Adicionais".
//
// ⚠️ Permissão: módulo SEM `modulo` aparece para TODO usuário logado (Agenda, Sala, POP…).
//    Módulo novo no portal = entrada nova aqui, com o `modulo` de permissão certo.
// `nomeAntigo` = como o card se chamava antes; a busca acha pelos dois nomes.
import {
  Settings, ClipboardList, ListChecks, Wrench, FileText, DollarSign, Activity,
  BarChart3, Users, Package, ClipboardCheck, Map, Calculator, Eye, Camera, Wheat, Megaphone,
  TrendingUp, Server, MapPin, ShieldCheck, Building, LayoutGrid, AlertCircle, Headset,
  Truck, UserPlus, Tags, Tractor, BookOpen, CalendarClock, CalendarDays, Radar, Layers, GraduationCap, SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'

export type SetorKey = 'comercial' | 'posvendas' | 'pecas' | 'financeiro' | 'adicionais'

export interface Setor { key: SetorKey; nome: string; cor: string; icon: LucideIcon; resumo: string }

export interface ModuloDash {
  id: string            // mesmo id dos cards antigos (auditoria, favoritos e TELAS.sistema usam)
  nome: string
  nomeAntigo?: string
  frase: string         // o que se FAZ na tela (não repetir o nome)
  href: string
  icon: LucideIcon
  setor: SetorKey
  sub?: string          // subgrupo dentro de Adicionais
  modulo?: string       // permissão; sem = todo logado
  acao?: string         // permissão granular: pode(modulo, acao)
  externo?: boolean
}

export const SETORES: Setor[] = [
  { key: 'comercial',  nome: 'Comercial',  cor: '#DC2626', icon: Building,   resumo: 'Vender trator e implemento' },
  { key: 'posvendas',  nome: 'Pós-Vendas', cor: '#0EA5E9', icon: Settings,   resumo: 'OS, revisão, garantia e técnicos' },
  { key: 'pecas',      nome: 'Peças',      cor: '#F97316', icon: Package,    resumo: 'Venda de peças e estoque' },
  { key: 'financeiro', nome: 'Financeiro', cor: '#10B981', icon: DollarSign, resumo: 'Contas, notas e resultado' },
  { key: 'adicionais', nome: 'Adicionais', cor: '#64748B', icon: Layers,     resumo: 'O que serve a mais de um setor' },
]

export const SUBS_ADICIONAIS = ['Dia a dia', 'Clientes e frota', 'Painéis', 'Ajuda e ajustes']

export const MODULOS: ModuloDash[] = [
  // ── Comercial
  { id: 'proposta-comercial', nome: 'Propostas', nomeAntigo: 'Proposta Comercial', frase: 'Montar a proposta em PDF para o cliente', href: '/propostas', icon: FileText, setor: 'comercial', modulo: 'propostas' },
  { id: 'feedbacks', nome: 'CRM e Retornos', nomeAntigo: 'Feedbacks & CRM', frase: 'Oportunidades e follow-up', href: '/feedbacks', icon: Megaphone, setor: 'comercial' },
  { id: 'inteligencia-vendas', nome: 'Inteligência de Vendas', frase: 'Quem renovar, onde focar', href: '/inteligencia-vendas', icon: Radar, setor: 'comercial', modulo: 'inteligencia-vendas' },
  { id: 'supervisor-vendas', nome: 'Equipe de Vendas', nomeAntigo: 'Supervisor Vendas', frase: 'Vendedores, visitas e mapa', href: '/supervisor-vendas', icon: TrendingUp, setor: 'comercial', modulo: 'supervisor-vendas' },
  { id: 'gestao-vendas', nome: 'Margem e Comissão', nomeAntigo: 'Gestão de Vendas', frase: 'Resultado do mês por vendedor', href: '/gestao-vendas', icon: BarChart3, setor: 'comercial', modulo: 'gestao-vendas' },
  { id: 'vendas-modelo', nome: 'Vendas por Modelo', frase: 'Quanto vendeu de cada modelo', href: '/vendas-modelo', icon: Tags, setor: 'comercial', modulo: 'vendas-modelo' },
  { id: 'pedidos-maquinas', nome: 'Pedidos de Máquinas', frase: 'Pedido de venda da máquina, com as parcelas da proposta', href: '/propostas?aba=pedidos', icon: Tractor, setor: 'comercial', modulo: 'pedidos-maquinas' },
  { id: 'marketing', nome: 'Feiras e Eventos', nomeAntigo: 'Marketing & Eventos', frase: 'Investimento, leads e retorno de cada evento', href: '/marketing', icon: Megaphone, setor: 'comercial', modulo: 'marketing' },
  { id: 'lead', nome: 'Anotar Lead', nomeAntigo: 'Captura de Leads', frase: 'Anotar o contato no estande, pelo celular', href: '/lead', icon: UserPlus, setor: 'comercial', modulo: 'lead' },

  // ── Pós-Vendas
  { id: 'pos', nome: 'Ordens de Serviço', nomeAntigo: 'Pós-Vendas (OS)', frase: 'Abrir, acompanhar e faturar as OS', href: '/pos', icon: Settings, setor: 'posvendas', modulo: 'pos' },
  { id: 'mecanicos', nome: 'Painel dos Técnicos', nomeAntigo: 'Gestão Pós Vendas', frase: 'Jornada, resultado e comissão dos técnicos', href: '/mecanicos', icon: Users, setor: 'posvendas', modulo: 'mecanicos' },
  { id: 'controle-revisao', nome: 'Revisões', nomeAntigo: 'Controle de Revisões', frase: 'Quais tratores estão com revisão vencendo', href: '/revisoes', icon: Wrench, setor: 'posvendas', modulo: 'revisoes' },
  { id: 'garantias', nome: 'Garantias', frase: 'Pedido à fábrica e cobrança ao cliente', href: '/garantias', icon: ShieldCheck, setor: 'posvendas', modulo: 'garantias' },
  { id: 'sat', nome: 'Chamados (SAT)', nomeAntigo: 'SAT Digital', frase: 'Pedidos de atendimento que chegam dos clientes', href: '/sat', icon: Headset, setor: 'posvendas' },
  { id: 'lousa', nome: 'Quadro da Oficina', nomeAntigo: 'Lousa Virtual', frase: 'Quem faz o quê em cada dia da semana', href: '/lousa', icon: ClipboardCheck, setor: 'posvendas', modulo: 'lousa' },
  { id: 'mapa-geral', nome: 'Mapa dos Técnicos', nomeAntigo: 'Mapeamento Técnico', frase: 'Onde está cada técnico agora', href: '/mapa-geral', icon: Map, setor: 'posvendas', modulo: 'mapa' },
  { id: 'fotos-tecnicos', nome: 'Fotos das OS', nomeAntigo: 'Fotos Técnicos', frase: 'O que os técnicos fotografaram em campo', href: '/fotos-tecnicos', icon: Camera, setor: 'posvendas', modulo: 'fotos-tecnicos' },
  { id: 'clientes', nome: 'Pasta do Cliente', nomeAntigo: 'Pastas Clientes', frase: 'Tudo de cada cliente: OS, pedidos e notas', href: '/clientes', icon: Building, setor: 'posvendas', modulo: 'clientes' },

  // ── Peças
  { id: 'ppv', nome: 'Pedidos de Peças', nomeAntigo: 'Peças (Pedido de Venda) PPV', frase: 'Vender peça e acompanhar o pedido', href: '/ppv', icon: Package, setor: 'pecas', modulo: 'ppv' },
  { id: 'consulta-omie', nome: 'Estoque', nomeAntigo: 'Consulta Estoque', frase: 'Saldo, custo e curva ABC', href: '/estoque', icon: Eye, setor: 'pecas', modulo: 'estoque' },
  { id: 'consulta-estoque', nome: 'Vitrine do Estoque', nomeAntigo: 'Visual Estoque', frase: 'Ver as peças com foto, como numa loja', href: '/visual-estoque', icon: BarChart3, setor: 'pecas', modulo: 'consulta-estoque' },
  { id: 'estoque-recebimentos', nome: 'Recebimentos', frase: 'Conferir a mercadoria que chegou', href: '/estoque/recebimentos', icon: Package, setor: 'pecas', modulo: 'estoque', acao: 'recebimentos' },
  { id: 'estoque-notas-entrada', nome: 'Notas de Compra', nomeAntigo: 'Notas de Entrada', frase: 'Notas de entrada, DANFE e custo', href: '/estoque/notas-entrada', icon: FileText, setor: 'pecas', modulo: 'estoque', acao: 'notas-entrada' },
  { id: 'estoque-movimentacao', nome: 'Entradas e Saídas', nomeAntigo: 'Movimentação de Produto kardex', frase: 'Tudo que entrou e saiu de um item', href: '/estoque/movimentacao-produto', icon: Activity, setor: 'pecas', modulo: 'estoque', acao: 'movimentacao-produto' },

  // ── Financeiro
  { id: 'sistema-financeiro', nome: 'Contas a Pagar e Receber', nomeAntigo: 'Financeiro', frase: 'Boletos, notas e chamados do financeiro', href: '/financeiro', icon: DollarSign, setor: 'financeiro', modulo: 'financeiro' },
  { id: 'financeiro-contas-cliente', nome: 'Contas do Cliente', frase: 'O que cada cliente ou fornecedor deve, e a calculadora de dívida', href: '/financeiro/contas-cliente', icon: Calculator, setor: 'financeiro', modulo: 'financeiro', acao: 'contas-cliente' },
  { id: 'financeiro-notas', nome: 'Notas Fiscais (todas)', nomeAntigo: 'Notas fiscais', frase: 'PDF e XML guardados no portal', href: '/financeiro/notas', icon: FileText, setor: 'financeiro', modulo: 'financeiro', acao: 'notas' },
  { id: 'dre', nome: 'Resultado (DRE)', nomeAntigo: 'DRE Financeiro', frase: 'Quanto a empresa ganhou ou perdeu no mês', href: '/dre-financeiro', icon: TrendingUp, setor: 'financeiro', modulo: 'dre' },

  // ── Adicionais (servem a mais de um setor)
  { id: 'tarefas', nome: 'Central de Trabalho', frase: 'Tarefas e tickets de todos', href: '/tickets/quadros', icon: ClipboardCheck, setor: 'adicionais', sub: 'Dia a dia', modulo: 'tarefas' },
  { id: 'agenda', nome: 'Agenda', frase: 'Compromissos de todos, por setor', href: '/agenda', icon: CalendarDays, setor: 'adicionais', sub: 'Dia a dia' },
  { id: 'reunioes', nome: 'Reuniões', frase: 'Pauta antes, ata depois', href: '/reunioes', icon: CalendarClock, setor: 'adicionais', sub: 'Dia a dia', modulo: 'tickets' },
  { id: 'salas', nome: 'Reservar Sala', nomeAntigo: 'Sala de reunião', frase: 'Ver se a sala está livre e marcar horário', href: '/salas', icon: MapPin, setor: 'adicionais', sub: 'Dia a dia' },
  { id: 'app-requisicoes', nome: 'Requisições', frase: 'Pedir material ou serviço', href: '/requisicoes', icon: ClipboardList, setor: 'adicionais', sub: 'Dia a dia', modulo: 'requisicoes' },
  { id: 'orcamentos', nome: 'Orçamentos', frase: 'Peças, mão de obra e deslocamento', href: '/orcamentos', icon: Calculator, setor: 'adicionais', sub: 'Dia a dia', modulo: 'orcamentos' },
  { id: 'avisos', nome: 'Avisos', frase: 'Comunicados para a equipe', href: '/avisos', icon: Megaphone, setor: 'adicionais', sub: 'Dia a dia', modulo: 'avisos' },
  { id: 'opa', nome: 'Opa! Ocorrências', nomeAntigo: 'Opa', frase: 'Avisar algo fora do lugar', href: '/opa', icon: AlertCircle, setor: 'adicionais', sub: 'Dia a dia' },
  { id: 'frota', nome: 'Frota', frase: 'Carros, abastecimento, multas e documentos', href: '/frota', icon: Truck, setor: 'adicionais', sub: 'Clientes e frota', modulo: 'frota' },
  { id: 'pendencias', nome: 'Problemas nos Carros', nomeAntigo: 'Pendências da frota', frase: 'Avisar um problema no carro, com foto', href: '/pendencias', icon: Wrench, setor: 'adicionais', sub: 'Clientes e frota', modulo: 'pendencias' },
  { id: 'painel-omie', nome: 'Relatórios Omie', nomeAntigo: 'Painel Omie', frase: 'Oficina, peças, comercial e comissões', href: '/painel-omie', icon: BarChart3, setor: 'adicionais', sub: 'Painéis', modulo: 'painel-omie' },
  { id: 'planta', nome: 'Planta Viva', frase: 'A empresa vista de cima', href: '/planta', icon: LayoutGrid, setor: 'adicionais', sub: 'Painéis', modulo: 'planta' },
  { id: 'dashboard-agro', nome: 'Dashboard Agro', frase: 'Acompanhamento do segmento agrícola', href: '/dashboard-agro', icon: Wheat, setor: 'adicionais', sub: 'Painéis', modulo: 'dashboard-agro' },
  { id: 'treinamento', nome: 'Treinamento', frase: 'Trilhas da sua área: ler, fazer a prova e ficar em dia', href: '/treinamento', icon: GraduationCap, setor: 'adicionais', sub: 'Ajuda e ajustes' },
  { id: 'pops', nome: 'Procedimentos (POP)', frase: 'Passo a passo de cada área', href: '/pops', icon: ListChecks, setor: 'adicionais', sub: 'Ajuda e ajustes' },
  { id: 'conhecimento', nome: 'Como Usar o Portal', nomeAntigo: 'Base de conhecimento', frase: 'Explicação de cada tela, passo a passo', href: '/conhecimento', icon: BookOpen, setor: 'adicionais', sub: 'Ajuda e ajustes' },
  { id: 'ajustes', nome: 'Ajustes de Estoque', nomeAntigo: 'Ajustes Estoque', frase: 'Custo, inventário, cadastro e famílias', href: '/ajustes', icon: SlidersHorizontal, setor: 'adicionais', sub: 'Ajuda e ajustes', modulo: 'ajustes' },
  { id: 'configuracoes', nome: 'Usuários e Permissões', nomeAntigo: 'Configurações admin', frase: 'Quem entra no portal e o que cada um vê', href: '/admin', icon: Settings, setor: 'adicionais', sub: 'Ajuda e ajustes', modulo: 'admin' },
  { id: 'back-nova', nome: 'Back Nova', frase: 'Sistema backend', href: 'https://back.novatratores.com', icon: Server, setor: 'adicionais', sub: 'Ajuda e ajustes', modulo: 'back-nova', externo: true },
]

export const corDoSetor = (k: SetorKey) => SETORES.find(s => s.key === k)?.cor ?? '#64748B'
