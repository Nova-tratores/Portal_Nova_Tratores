// =====================================================================
// CRM de Desova — MODO DEMONSTRAÇÃO
// Dados de exemplo + as MESMAS regras de negócio das migrations do pacote
// (sql/01..07 em Documentos). Nada aqui toca o Supabase: é para navegar
// no localhost e entender a ideia antes de aplicar as migrations reais.
// =====================================================================

export const TAXA_PATIO_MES = 0.015;       // 1,5% a.m. sobre o custo congelado
export const COMISSAO_PCT_MARGEM = 0.10;   // 10% da margem líquida
export const COMISSAO_MINIMA = 300;
export const META_VALOR = 2_000_000;
export const META_DIAS = 90;

// Acelerador de desova: chassi velho exige menos margem e paga mais comissão
export const FAIXAS = [
  { diasMin: 0,   diasMax: 90,   margemMin: 0.12,  fator: 1.0, rotulo: 'Novo em pátio',       cor: '#16a34a' },
  { diasMin: 91,  diasMax: 180,  margemMin: 0.08,  fator: 1.25, rotulo: 'Atenção',             cor: '#d97706' },
  { diasMin: 181, diasMax: 270,  margemMin: 0.05,  fator: 1.5, rotulo: 'Desova',              cor: '#ea580c' },
  { diasMin: 271, diasMax: 365,  margemMin: 0.025, fator: 1.8, rotulo: 'Desova urgente',      cor: '#dc2626' },
  { diasMin: 366, diasMax: 9999, margemMin: 0,     fator: 2.0, rotulo: 'Break-even liberado', cor: '#7f1d1d' },
];

export const ESTAGIOS = [
  { codigo: 'mapeado',     nome: 'Mapeado / Indicação',     prob: 0.10, sla: 5, dono: 'vendedor' },
  { codigo: 'visita',      nome: 'Visita Realizada',        prob: 0.25, sla: 5, dono: 'vendedor' },
  { codigo: 'proposta',    nome: 'Proposta Apresentada',    prob: 0.45, sla: 3, dono: 'vendedor' },
  { codigo: 'negociacao',  nome: 'Negociação / Alçada',     prob: 0.60, sla: 2, dono: 'gestor' },
  { codigo: 'credito',     nome: 'Crédito / Financiamento', prob: 0.75, sla: 7, dono: 'banco' },
  { codigo: 'faturamento', nome: 'Aprovado — Faturar',      prob: 0.92, sla: 3, dono: 'faturamento' },
];

// ---------------------------------------------------------------------
// Funções de cálculo (espelham as functions SQL crm_custo_total,
// crm_piso_vendedor, crm_alcada_requerida, crm_comissao_estimada)
// ---------------------------------------------------------------------

export const diasDesde = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso + 'T12:00:00-03:00').getTime()) / 86400000));

export const faixaDe = (dias: number) =>
  FAIXAS.find((f) => dias >= f.diasMin && dias <= f.diasMax) ?? FAIXAS[FAIXAS.length - 1];

export const custoPatio = (custo: number, dias: number) =>
  custo * TAXA_PATIO_MES * (dias / 30);

export const custoTotal = (m: Maquina) => {
  const dias = diasDesde(m.entradaPatio);
  return m.custoAquisicao + custoPatio(m.custoAquisicao, dias);
};

export const sangriaDia = (m: Maquina) => (m.custoAquisicao * TAXA_PATIO_MES) / 30;

export const pisoVendedor = (m: Maquina) => {
  const f = faixaDe(diasDesde(m.entradaPatio));
  return custoTotal(m) * (1 + f.margemMin);
};

export type Alcada = 'vendedor' | 'gestor' | 'diretoria';
export const alcadaRequerida = (m: Maquina, valor: number): Alcada => {
  if (valor >= pisoVendedor(m)) return 'vendedor';
  if (valor >= custoTotal(m)) return 'gestor';
  return 'diretoria'; // abaixo do break-even real: só a diretoria decide
};

export const comissaoEstimada = (m: Maquina, valor: number) => {
  const f = faixaDe(diasDesde(m.entradaPatio));
  const margem = valor - custoTotal(m);
  return Math.max(COMISSAO_MINIMA, margem * COMISSAO_PCT_MARGEM * f.fator);
};

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const brl2 = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------------
// DADOS DE DEMONSTRAÇÃO
// ---------------------------------------------------------------------

export interface Maquina {
  id: string;
  chassi: string;
  modelo: string;
  condicao: 'novo' | 'usado' | 'demo';
  custoAquisicao: number;
  valorTabela: number;
  entradaPatio: string; // YYYY-MM-DD
  status: 'disponivel' | 'reservada' | 'vendida';
}

export const MAQUINAS: Maquina[] = [
  { id: 'm1', chassi: 'MH6075-4821', modelo: 'Mahindra 6075 4x4 Cab', condicao: 'novo',  custoAquisicao: 298000, valorTabela: 385000, entradaPatio: '2025-06-05', status: 'disponivel' },
  { id: 'm2', chassi: 'MH9205-1177', modelo: 'Mahindra 9205 4x4',     condicao: 'novo',  custoAquisicao: 372000, valorTabela: 465000, entradaPatio: '2025-11-02', status: 'reservada'  },
  { id: 'm3', chassi: 'MH6065-3390', modelo: 'Mahindra 6065 4x4',     condicao: 'novo',  custoAquisicao: 231000, valorTabela: 298000, entradaPatio: '2026-01-18', status: 'disponivel' },
  { id: 'm4', chassi: 'MH4118-0244', modelo: 'Mahindra 4118 4x4',     condicao: 'novo',  custoAquisicao: 118000, valorTabela: 152000, entradaPatio: '2026-04-22', status: 'reservada'  },
  { id: 'm5', chassi: 'MH7085-8812', modelo: 'Mahindra 7085 Demo',    condicao: 'demo',  custoAquisicao: 265000, valorTabela: 330000, entradaPatio: '2026-02-10', status: 'disponivel' },
  { id: 'm6', chassi: 'MF4275-USA1', modelo: 'MF 4275 (usado/troca)', condicao: 'usado', custoAquisicao: 96000,  valorTabela: 135000, entradaPatio: '2026-07-08', status: 'disponivel' },
];

export interface Lead {
  id: string;
  nome: string;
  fazenda: string;
  municipio: string;
  km: number;
  cultura: string;
  areaHa: number | null;
  telefone: string;
  cargo: string;
  decisor: boolean;
  janela: string;
  caixaMensal: boolean;
}

export const LEADS: Lead[] = [
  { id: 'l1', nome: 'José Ribeiro',     fazenda: 'Sítio Boa Vista',     municipio: 'Timburi',     km: 34, cultura: 'Pecuária de leite', areaHa: 72,  telefone: '5514991110001', cargo: 'Proprietário', decisor: true,  janela: 'imediata',        caixaMensal: true },
  { id: 'l2', nome: 'Maria Aparecida',  fazenda: 'Fazenda Santa Fé',    municipio: 'Piraju',      km: 8,  cultura: 'Café',              areaHa: 140, telefone: '5514991110002', cargo: 'Proprietária', decisor: true,  janela: 'pre_plantio',     caixaMensal: false },
  { id: 'l3', nome: 'Carlos Eduardo',   fazenda: 'Rancho CE',           municipio: 'Sarutaiá',    km: 22, cultura: 'Pecuária de corte', areaHa: 210, telefone: '5514991110003', cargo: 'Filho/sucessor', decisor: true, janela: 'pos_safra',      caixaMensal: false },
  { id: 'l4', nome: 'Antônio Baldini',  fazenda: 'Granja Baldini',      municipio: 'Fartura',     km: 41, cultura: 'Aves',              areaHa: 18,  telefone: '5514991110004', cargo: 'Proprietário', decisor: true,  janela: 'imediata',        caixaMensal: true },
  { id: 'l5', nome: 'Sebastião Prado',  fazenda: 'Faz. Água Limpa',     municipio: 'Tejupá',      km: 29, cultura: 'Grãos',             areaHa: 380, telefone: '5514991110005', cargo: 'Proprietário', decisor: true,  janela: 'pos_safra',       caixaMensal: false },
  { id: 'l6', nome: 'Luana Ferrari',    fazenda: 'Sítio Ferrari',       municipio: 'Manduri',     km: 26, cultura: 'Hortifruti',        areaHa: 12,  telefone: '5514991110006', cargo: 'Proprietária', decisor: true,  janela: 'imediata',        caixaMensal: true },
  { id: 'l7', nome: 'Ademir Souza',     fazenda: '—',                   municipio: 'Piraju',      km: 6,  cultura: '?',                 areaHa: null, telefone: '5514991110007', cargo: 'Tratorista',   decisor: false, janela: 'sem_prazo',      caixaMensal: false },
  { id: 'l8', nome: 'Chácara Recanto',  fazenda: 'Recanto Verde',       municipio: 'Bernardino',  km: 52, cultura: 'Pastagem',          areaHa: 45,  telefone: '5514991110008', cargo: '?',            decisor: false, janela: 'sem_prazo',      caixaMensal: false },
];

export interface Deal {
  id: string;
  codigo: string;
  leadId: string;
  maquinaId: string | null;
  estagio: string;
  valorNegociado: number | null;
  diasSemContato: number;
  aprovacao: 'nao_requer' | 'pendente' | 'aprovado';
  ganho?: boolean;
  perdido?: { motivo: string };
}

export const DEALS: Deal[] = [
  { id: 'd1', codigo: 'OP-2026-0007', leadId: 'l1', maquinaId: 'm1', estagio: 'proposta',    valorNegociado: 342000, diasSemContato: 6, aprovacao: 'nao_requer' },
  { id: 'd2', codigo: 'OP-2026-0011', leadId: 'l2', maquinaId: 'm3', estagio: 'negociacao',  valorNegociado: 262000, diasSemContato: 1, aprovacao: 'pendente' },
  { id: 'd3', codigo: 'OP-2026-0012', leadId: 'l3', maquinaId: 'm2', estagio: 'credito',     valorNegociado: 438000, diasSemContato: 9, aprovacao: 'aprovado' },
  { id: 'd4', codigo: 'OP-2026-0014', leadId: 'l4', maquinaId: 'm5', estagio: 'visita',      valorNegociado: 315000, diasSemContato: 2, aprovacao: 'nao_requer' },
  { id: 'd5', codigo: 'OP-2026-0016', leadId: 'l5', maquinaId: 'm2', estagio: 'mapeado',     valorNegociado: null,   diasSemContato: 12, aprovacao: 'nao_requer' },
  { id: 'd6', codigo: 'OP-2026-0017', leadId: 'l6', maquinaId: 'm4', estagio: 'faturamento', valorNegociado: 149000, diasSemContato: 0, aprovacao: 'nao_requer' },
  { id: 'd7', codigo: 'OP-2026-0004', leadId: 'l3', maquinaId: 'm6', estagio: 'ganho',       valorNegociado: 128000, diasSemContato: 0, aprovacao: 'nao_requer', ganho: true },
  { id: 'd8', codigo: 'OP-2026-0002', leadId: 'l5', maquinaId: null, estagio: 'perdido',     valorNegociado: 410000, diasSemContato: 0, aprovacao: 'nao_requer', perdido: { motivo: 'credito_negado' } },
  { id: 'd9', codigo: 'OP-2026-0003', leadId: 'l8', maquinaId: null, estagio: 'perdido',     valorNegociado: 165000, diasSemContato: 0, aprovacao: 'nao_requer', perdido: { motivo: 'preco' } },
];

export const lead = (id: string) => LEADS.find((l) => l.id === id)!;
export const maquina = (id: string | null) => (id ? MAQUINAS.find((m) => m.id === id) ?? null : null);

export const valorPonderado = (d: Deal) => {
  const e = ESTAGIOS.find((x) => x.codigo === d.estagio);
  return (d.valorNegociado ?? 0) * (e?.prob ?? 0);
};

// Score do roteiro (espelha crm_roteiro_do_dia):
// valor ponderado × urgência do chassi × esfriamento do contato
export const scoreRoteiro = (d: Deal) => {
  const m = maquina(d.maquinaId);
  const dias = m ? diasDesde(m.entradaPatio) : 0;
  return (
    ((valorPonderado(d) || 50000) / 1000) *
    (1 + dias / 180) *
    (1 + Math.min(d.diasSemContato, 30) / 10)
  );
};

// ---------------------------------------------------------------------
// TRIAGEM (cockpit) — demo
// ---------------------------------------------------------------------

export interface Conversa {
  leadId: string;
  aguardandoMin: number;
  slaHoras: number | null;
  mensagens: { de: 'cliente' | 'loja'; texto: string; hora: string }[];
}

export const CONVERSAS: Conversa[] = [
  {
    leadId: 'l7',
    aguardandoMin: 132,
    slaHoras: 1,
    mensagens: [
      { de: 'cliente', texto: 'Boa tarde, queria saber o preço do trator 75', hora: '11:02' },
    ],
  },
  {
    leadId: 'l8',
    aguardandoMin: 12,
    slaHoras: 4,
    mensagens: [
      { de: 'cliente', texto: 'Oi, vi vocês na feira de Avaré. Tenho uma chácara e tô precisando de um trator pequeno', hora: '13:40' },
      { de: 'loja', texto: 'Boa tarde! Aqui é o atendimento da Nova Tratores em Piraju. Que bom que nos achou — me conta um pouco da sua área?', hora: '13:47' },
      { de: 'cliente', texto: 'São uns 18 alqueires, mais pasto. Hoje uso um tobata velho', hora: '13:52' },
    ],
  },
  {
    leadId: 'l4',
    aguardandoMin: 3,
    slaHoras: 24,
    mensagens: [
      { de: 'cliente', texto: 'O financiamento que conversamos, consegue simular no Sicredi também?', hora: '13:58' },
    ],
  },
];

export interface PassoJornada {
  ordem: number;
  titulo: string;
  script: string;
  ajuda: string;
  opcoes?: { rotulo: string; peso: number }[];
  feito?: boolean;
  resposta?: string;
}

export const JORNADA_L8: PassoJornada[] = [
  { ordem: 1, titulo: 'Abertura', script: '', ajuda: 'Responder em até 1 hora. Em agro, o primeiro que responde fica com a conversa.', feito: true, resposta: 'enviada 13:47' },
  { ordem: 2, titulo: 'Máquina, peça ou assistência?', script: '', ajuda: 'Metade do WhatsApp de concessionária é peça — tira do funil o que é pós-venda.', feito: true, resposta: 'Máquina' },
  { ordem: 3, titulo: 'Qual serviço a máquina vai fazer', script: '', ajuda: 'Perguntar o serviço, não o modelo. O implemento define a potência.', feito: true, resposta: 'roçar pasto + carreta' },
  { ordem: 4, titulo: 'Cidade e propriedade', script: '', ajuda: 'Define rota. Fora da região vira repasse.', feito: true, resposta: 'Bernardino de Campos' },
  {
    ordem: 5, titulo: 'Área e cultura',
    script: 'Quantos alqueires você trabalha hoje? E é com o quê — pasto, café, grão?',
    ajuda: 'Alqueire paulista = 2,42 ha. Anote em hectares. Peso alto no score.',
  },
  {
    ordem: 6, titulo: 'Prazo de compra',
    script: 'Você está pensando em resolver isso pra quando?',
    ajuda: 'É o critério de maior peso: sem janela, não há visita.',
    opcoes: [
      { rotulo: 'Agora / esse mês', peso: 25 },
      { rotulo: 'Antes do plantio', peso: 25 },
      { rotulo: 'Depois da safra', peso: 10 },
      { rotulo: 'Só levantando preço', peso: 0 },
    ],
  },
  { ordem: 7, titulo: 'Forma de pagamento', script: 'Costuma trabalhar com financiamento ou recurso próprio? Qual banco?', ajuda: 'Descobrir o banco cedo economiza semanas: o dossiê começa antes da visita.' },
  { ordem: 8, titulo: 'Quem decide', script: 'A decisão é sua mesma ou tem mais alguém da família?', ajuda: 'Proposta apresentada a quem não decide volta pro começo.' },
];

export const CRITERIOS_L8 = [
  { nome: 'Área ≥ 50 ha (43,5 ha)', peso: 20, bateu: false },
  { nome: 'Área entre 20 e 50 ha', peso: 10, bateu: true },
  { nome: 'Compra em até 90 dias', peso: 25, bateu: false },
  { nome: 'Falando com o decisor', peso: 15, bateu: false },
  { nome: 'Relacionamento bancário', peso: 15, bateu: false },
  { nome: 'Máquina atual com 5+ anos', peso: 10, bateu: true },
  { nome: 'Dentro de rota ativa', peso: 10, bateu: true },
];

export const ARGUMENTOS = [
  {
    objecao: 'Mahindra é indiana, e peça?',
    categoria: 'marca',
    resposta: 'O ponto não é o país, é quem atende quando a máquina para. Peça de giro nós temos aqui em Piraju, e o técnico é nosso, não terceirizado.',
    volta: 'Quando sua máquina atual parou da última vez, quanto tempo levou pra voltar a rodar?',
  },
  {
    objecao: 'Está caro / vi mais barato',
    categoria: 'preco',
    resposta: 'Se a comparação for só a etiqueta, sempre vai ter alguém mais barato. O que muda o bolso é o custo por hora trabalhada: consumo, manutenção e tempo parado.',
    volta: 'A proposta que você viu inclui entrega técnica e revisões, ou é só a máquina?',
  },
  {
    objecao: 'Vou esperar a safra pra decidir',
    categoria: 'momento',
    resposta: 'Faz sentido esperar o caixa. Só que preço de máquina não costuma cair na entressafra, e a liberação do crédito não é imediata.',
    volta: 'Se o crédito ficasse aprovado e você só liberasse a entrega depois da colheita, resolveria?',
  },
  {
    objecao: 'Qual o preço?',
    categoria: 'preco',
    resposta: 'Te passo sim — mas o preço muda conforme configuração e forma de pagamento; número solto agora só ia te confundir.',
    volta: 'Me diz o serviço que ela vai fazer que eu mando o valor da configuração certa, com a condição junto.',
  },
];
