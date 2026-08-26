// Dados do seed do War Room — 13 ações do plano aprovado (12/08/2026).
// Fonte: plano_execucao_nova_tratores.xlsx
// Os DONO_* são placeholders de PAPEL; o runner (seed-war-room.ts) os troca
// pelos uuids de financeiro_usu passados por variável de ambiente.

export type PapelDono =
  | 'DONO_COMERCIAL' | 'DONO_FINANCEIRO' | 'DONO_CONTROLADORIA'
  | 'DONO_POSVENDA' | 'DONO_DIRECAO'

export interface AcaoSeed {
  fase: '0_estancar' | '1_atacar' | '2_redimensionar' | '3_governanca'
  ordem: number
  titulo: string
  causa_raiz: string
  entregavel: string
  indicador: string
  meta: string
  consequencia: string
  prazo_estrategico: string
  dono: PapelDono
}

export const ACOES_SEED: AcaoSeed[] = [
  // ---- FASE 0 — ESTANCAR ----
  {
    fase: '0_estancar', ordem: 1,
    titulo: 'Piso de margem por família — proibir venda no negativo',
    causa_raiz: '#1 Margem negativa (vendas a -45%/-109%)',
    entregavel: 'Tabela de pisos por família publicada + trava/alerta no fluxo de proposta',
    indicador: 'Vendas fechadas abaixo do piso sem aprovação', meta: '0 por semana',
    consequencia: 'Venda fora do piso sem assinatura da direção = perda da comissão. Exceção única: liquidação planejada (ação 6).',
    prazo_estrategico: '2026-08-14', dono: 'DONO_COMERCIAL',
  },
  {
    fase: '0_estancar', ordem: 2,
    titulo: 'Conciliação total dos lançamentos financeiros (NOVA e CASTRO)',
    causa_raiz: '#6 Dados sob suspeita [VALIDAR] — DPO CASTRO 273d',
    entregavel: 'Diagnóstico re-emitido sem nenhum item [VALIDAR]; DPO real apurado',
    indicador: '% de títulos conciliados', meta: '100% até o prazo',
    consequencia: 'Sem conciliação completa: suspensos bônus e flexibilidades da equipe financeira.',
    prazo_estrategico: '2026-08-26', dono: 'DONO_FINANCEIRO',
  },
  {
    fase: '0_estancar', ordem: 3,
    titulo: 'Cadência do War Room de Caixa (segundas 8h, projeção 13 semanas)',
    causa_raiz: 'Todas — governança de caixa',
    entregavel: 'Projeção 13 semanas atualizada toda segunda, cenários com/sem antecipação',
    indicador: 'Reunião realizada com projeção atualizada', meta: 'Toda segunda, sem falha',
    consequencia: 'Os 3 sentinelas são o placar oficial da empresa.',
    prazo_estrategico: '2026-08-17', dono: 'DONO_FINANCEIRO',
  },
  // ---- FASE 1 — ATACAR CAUSAS ----
  {
    fase: '1_atacar', ordem: 4,
    titulo: 'Abrir título a título as devoluções jan–mar/26 (R$2,1M)',
    causa_raiz: '#3 Onda anômala de devoluções (24% da receita bruta)',
    entregavel: 'Laudo com causa por título e % por motivo; decisão sobre o funil',
    indicador: '% dos títulos com causa identificada', meta: '100%',
    consequencia: 'Se causa = crédito negado: venda passa a firmar SOMENTE com crédito aprovado.',
    prazo_estrategico: '2026-08-19', dono: 'DONO_CONTROLADORIA',
  },
  {
    fase: '1_atacar', ordem: 5,
    titulo: 'Investigar evento de despesa de jan/24 (~-R$1,9M)',
    causa_raiz: 'Evento não explicado que contamina o comparativo 2023–2024',
    entregavel: 'Nota técnica: natureza, classificação e impacto no comparativo anual',
    indicador: 'Evento explicado e classificado', meta: 'Concluído',
    consequencia: '—',
    prazo_estrategico: '2026-08-19', dono: 'DONO_CONTROLADORIA',
  },
  {
    fase: '1_atacar', ordem: 6,
    titulo: 'Liquidação cirúrgica do estoque parado (R$1,84M / 74% >180d)',
    causa_raiz: '#5 Capital parado em estoque, corrosão de R$552k já contabilizada',
    entregavel: 'Lista item a item (custo, mercado, carregamento) com destino aprovado: venda com teto de perda, permuta ou devolução à fábrica',
    indicador: 'R$ de estoque >180d convertido em caixa', meta: '≥ 50% em 90 dias',
    consequencia: 'Perda máxima por item aprovada pela direção ANTES da oferta.',
    prazo_estrategico: '2026-08-19', dono: 'DONO_COMERCIAL',
  },
  {
    fase: '1_atacar', ordem: 7,
    titulo: 'Força-tarefa nos 6 maiores devedores (R$1,97M em atraso)',
    causa_raiz: '#6 Inadimplência concentrada',
    entregavel: 'Plano individual por cliente: renegociação com garantia real, dação ou jurídico',
    indicador: 'R$ recuperado ou reestruturado com garantia', meta: '≥ R$1,0M em 60 dias',
    consequencia: 'Devedor relevante não compra mais a prazo. Validar valores após a conciliação (ação 2).',
    prazo_estrategico: '2026-08-26', dono: 'DONO_FINANCEIRO',
  },
  {
    fase: '1_atacar', ordem: 8,
    titulo: 'Mapa 100% do endividamento bancário (saldo, taxa, parcelas futuras)',
    causa_raiz: '#4 Custo financeiro + dado faltante nº5 do diagnóstico',
    entregavel: 'Mapa contrato a contrato + cronograma de parcelas 12m + % do caixa comprometido',
    indicador: '% dos contratos mapeados', meta: '100% até o prazo',
    consequencia: 'Sem o serviço da dívida mapeado, a projeção de 13 semanas é chute.',
    prazo_estrategico: '2026-08-21', dono: 'DONO_FINANCEIRO',
  },
  {
    fase: '1_atacar', ordem: 9,
    titulo: 'Desmame da antecipação de duplicatas',
    causa_raiz: '#4 Espiral de custo financeiro (R$1,5M em 18 meses)',
    entregavel: 'Cronograma mensal de redução, substituindo por caixa das ações 6 e 7',
    indicador: 'Volume antecipado no mês vs. mês anterior', meta: '-25% ao mês',
    consequencia: 'Acompanhado no snapshot semanal (volume_antecipado).',
    prazo_estrategico: '2026-12-31', dono: 'DONO_FINANCEIRO',
  },
  // ---- FASE 2 — REDIMENSIONAR ----
  {
    fase: '2_redimensionar', ordem: 10,
    titulo: 'Ponto de equilíbrio + plano de corte de despesa fixa (20–25%)',
    causa_raiz: '#2 Estrutura de 6 tratores/mês com venda de 1/mês',
    entregavel: 'Estudo de break-even + plano de corte poupando áreas geradoras de receita, com filtro de caixas a/b/c e tranches com checkpoint',
    indicador: 'Despesa fixa mensal vs. base ago/26', meta: '-20% a -25% até nov/26',
    consequencia: "Posições protegidas (caixa 'a' + quem sustenta dado e cobrança) listadas por escrito.",
    prazo_estrategico: '2026-09-11', dono: 'DONO_CONTROLADORIA',
  },
  {
    fase: '2_redimensionar', ordem: 11,
    titulo: 'Pivô do mix para pós-venda (peças, serviço, contratos, seminovo)',
    causa_raiz: '#1 + #2 Mix atual sem margem e sem giro',
    entregavel: 'Plano comercial de pós-venda com metas mensais por linha',
    indicador: 'Índice de absorção (margem pós-venda ÷ despesa fixa)', meta: '100% em 12 meses',
    consequencia: 'Marco de 90 dias: plano rodando com meta mensal.',
    prazo_estrategico: '2026-11-10', dono: 'DONO_POSVENDA',
  },
  {
    fase: '2_redimensionar', ordem: 12,
    titulo: 'Renegociar financiamento do estoque com banco/fábrica',
    causa_raiz: '#5 Estoque financiado caro',
    entregavel: 'Termo renegociado (taxa/prazo) ou plano de devolução de unidades',
    indicador: 'Custo mensal de carregamento do estoque', meta: 'Redução ≥ 30%',
    consequencia: 'Insumo: mapa de dívidas (ação 8). Ordem de ataque: maior taxa com garantia mais folgada.',
    prazo_estrategico: '2026-10-10', dono: 'DONO_DIRECAO',
  },
  // ---- FASE 3 — GOVERNANÇA ----
  {
    fase: '3_governanca', ordem: 13,
    titulo: 'Reunião mensal de resultado (DRE por família + margem por venda fechada)',
    causa_raiz: 'Todas — não repetir 2024',
    entregavel: 'Ata mensal com dono nomeado e meta numérica por causa-raiz',
    indicador: 'Reunião realizada com todas as áreas reportando', meta: '12/12 meses',
    consequencia: 'Primeira reunião: 01/09/2026.',
    prazo_estrategico: '2026-09-01', dono: 'DONO_DIRECAO',
  },
]

// Fontes da ponte (acao_ordem vincula à ação correspondente após criá-las).
// Metas de "corte de fixas" (R$400k) e "renegociação" (R$300k) são estimativas
// para fechar a ponte acima de R$2M com folga — ajustar após break-even (ação
// 10) e mapa de dívidas (ação 8).
export interface PonteSeed { nome: string; meta: number; prazo: string; acao_ordem: number }
export const PONTE_SEED: PonteSeed[] = [
  { nome: 'Cobrança dos grandes devedores', meta: 1_000_000, prazo: '2026-10-26', acao_ordem: 7 },
  { nome: 'Liquidação de estoque parado',    meta:   900_000, prazo: '2026-11-19', acao_ordem: 6 },
  { nome: 'Redução de despesa fixa',         meta:   400_000, prazo: '2026-12-31', acao_ordem: 10 },
  { nome: 'Renegociação banco/fábrica',      meta:   300_000, prazo: '2026-12-31', acao_ordem: 12 },
]

// Definições estratégicas (só os temas; a direção detalha contexto/decisão na
// tela). decisao_a_extrair traz um rascunho editável (o campo é obrigatório).
export interface DefinicaoSeed { tema: string; decisao_a_extrair: string }
export const DEFINICOES_SEED: DefinicaoSeed[] = [
  { tema: 'Dedicação e composição da direção', decisao_a_extrair: 'Quem se dedica à recuperação e em que regime (a detalhar).' },
  { tema: 'Liderança da recuperação e comunicação do norte aos funcionários', decisao_a_extrair: 'Quem lidera e como o norte é comunicado (a detalhar).' },
  { tema: 'Fechamento da ponte de caixa até dezembro', decisao_a_extrair: 'Como fechar o gap de caixa até dez/2026 (a detalhar).' },
  { tema: 'Continuidade da linha de quadriciclos (custo total: comercial + pós-vendas)', decisao_a_extrair: 'Manter ou encerrar a linha, com custo total (a detalhar).' },
  { tema: 'Estratégia de recomposição de receita do comercial', decisao_a_extrair: 'Como recompor a receita comercial (a detalhar).' },
  { tema: 'Dimensionamento de equipe e critérios de proteção de posições', decisao_a_extrair: 'Tamanho da equipe e critérios de proteção (a detalhar).' },
]
