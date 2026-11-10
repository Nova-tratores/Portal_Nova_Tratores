// Módulos que o Admin concede (lista única: tela Administração e o editor em cartões).
// Saiu de src/app/(portal)/admin/page.tsx em 09/11/2026, sem mudar nada.
// Administração como módulo (José, 10/11/2026): quem tem, sem ser Admin, entra no /admin
// só para dar e tirar acessos do Portal. Só um Admin dá ou tira este módulo.
export const MODULO_ADMINISTRACAO = 'administracao'

export const MODULOS_ADMIN: { id: string; label: string; color: string }[] = [
  { id: MODULO_ADMINISTRACAO, label: 'Administração (dar e tirar acessos)', color: '#0f172a' },
  // Ajustes: módulo único que expande nas páginas (ações vêm de
  // ACOES_POR_MODULO['ajustes'], derivado de PAGINAS_AJUSTES).
  { id: 'ajustes', label: 'Ajustes', color: '#991b1b' },
  // Atividades e Back Nova existiam como telas/cards mas NUNCA estiveram nesta
  // lista — a permissão era impossível de conceder pela tela (29/07/2026).
  { id: 'atividades', label: 'Atividades (logs)', color: '#6b7280' },
  { id: 'planta', label: 'Planta Viva (financeiro dentro dela: admin ou a ação “números sensíveis”)', color: '#0e7490' },
  { id: 'avisos', label: 'Avisos', color: '#dc2626' },
  // Base de conhecimento: ler é livre; o módulo dá o direito de escrever/aprovar em QUALQUER módulo
  // (o responsável de cada módulo, em kb_responsaveis, aprova o seu sem precisar disto).
  { id: 'conhecimento', label: 'Base de conhecimento (escrever/aprovar)', color: '#0369a1' },
  // POPs: dono e aprovador são por ÁREA (tela do módulo); aqui só admin do módulo e executar.
  { id: 'pops', label: 'POPs (procedimentos)', color: '#0f766e' },
  { id: 'back-nova', label: 'Back Nova (externo)', color: '#6b7280' },
  { id: 'clientes', label: 'Clientes', color: '#dc2626' },
  { id: 'consulta-estoque', label: 'Visual Estoque', color: '#7f1d1d' },
  { id: 'revisoes', label: 'Controle de Revisões', color: '#b91c1c' },
  { id: 'dashboard-agro', label: 'Dashboard Agro', color: '#16a34a' },
  { id: 'dre', label: 'DRE Financeiro', color: '#dc2626' },
  { id: 'estoque', label: 'Consulta Estoque', color: '#991b1b' },
  { id: 'feedbacks', label: 'Feedbacks & CRM', color: '#dc2626' },
  { id: 'financeiro', label: 'Financeiro', color: '#dc2626' },
  { id: 'fotos-tecnicos', label: 'Fotos Técnicos', color: '#dc2626' },
  // Frota: expande nas telas (ações derivadas de PAGINAS_FROTA). O
  // Abastecimento é submódulo dele (`frota:abastecimento`) — e note que o
  // módulo `abastecimento` NUNCA esteve nesta lista, por isso a permissão dele
  // era impossível de conceder pela tela.
  { id: 'frota', label: 'Frota', color: '#0d9488' },
  { id: 'garantias', label: 'Garantias', color: '#0ea5e9' },
  { id: 'gestao-vendas', label: 'Gestão de Vendas', color: '#dc2626' },
  // Captura de Leads: tela mobile do estande (feira), sem exigir o módulo
  // Marketing inteiro — mesmo desenho do 'pendencias' em relação ao 'frota'.
  { id: 'lead', label: 'Captura de Leads (celular)', color: '#DB2777' },
  { id: 'marketing', label: 'Marketing & Eventos', color: '#DB2777' },
  { id: 'inteligencia-vendas', label: 'Inteligência de Vendas', color: '#dc2626' },
  { id: 'mecanicos', label: 'Gestão Pós Vendas', color: '#1d4ed8' },
  { id: 'mapa', label: 'Mapeamento Técnico', color: '#b91c1c' },
  // Lousa Virtual (agenda semanal dos técnicos; também lança na Agenda coletiva) — faltava aqui (16/10/2026)
  { id: 'lousa', label: 'Lousa Virtual (agenda dos técnicos)', color: '#0ea5e9' },
  { id: 'opa', label: 'Opa (Ocorrências)', color: '#dc2626' },
  // Peças não identificadas (aba do Opa): fotografar/cadastrar é de todos; este módulo
  // é o "setor de peças" — identificar, precificar, mudar status, exportar, cadastros.
  { id: 'opa-pecas', label: 'Opa Peças — editar peças S/Estoque', color: '#ea580c' },
  // Patrimônio Loja (aba do Opa): o que a loja tem. Quem tinha Opa Peças ganhou
  // no sql/patrimonio-01.sql; daqui libera ou bloqueia por pessoa.
  { id: 'patrimonio', label: 'Patrimônio Loja (aba do Opa)', color: '#4f46e5' },
  { id: 'orcamentos', label: 'Orçamentos', color: '#ef4444' },
  { id: 'painel-mecanicos', label: 'Painel Mecânicos', color: '#3b82f6' },
  { id: 'painel-omie', label: 'Painel Omie (relatorios)', color: '#1f5c46' },
  { id: 'ppv', label: 'Peças (PPV)', color: '#ef4444' },
  // Pendências da frota: abrir/acompanhar pendências dos carros sem precisar
  // do módulo Frota inteiro (quem tem Frota também acessa).
  { id: 'pendencias', label: 'Pendências da frota', color: '#1e40af' },
  { id: 'cameras', label: 'Vigia das Câmeras', color: '#dc2626' },
  { id: 'pos', label: 'Pós-Vendas (OS)', color: '#dc2626' },
  { id: 'propostas', label: 'Proposta Comercial', color: '#991b1b' },
  { id: 'requisicoes', label: 'Requisições', color: '#ef4444' },
  { id: 'sat', label: 'SAT Digital', color: '#0ea5e9' },
  { id: 'supervisor-vendas', label: 'Supervisor Vendas', color: '#dc2626' },
  { id: 'crm-vendas', label: 'CRM Vendas (painel do app de vendas)', color: '#dc2626' },
  { id: 'tarefas', label: 'Tarefas (já vem na Central de Trabalho)', color: '#dc2626' },
  { id: 'tickets', label: 'Central de Trabalho (Tarefas · Tickets · Cronograma)', color: '#0891b2' },
  { id: 'tratorilson', label: 'Tratorilson (Chat IA)', color: '#ef4444' },
  // Vendas por Modelo (/vendas-modelo): mesma tela de /dre-financeiro/vendas-modelo,
  // liberável pelo grupo Comercial sem dar o DRE inteiro.
  { id: 'vendas-modelo', label: 'Vendas por Modelo', color: '#dc2626' },
  { id: 'war-room', label: 'War Room', color: '#b91c1c' },
]
