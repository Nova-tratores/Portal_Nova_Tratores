// Textos de AJUDA de cada tela do modulo DRE Financeiro.
//
// Consumido pelo botao "?" do cabecalho do modulo (components/dre-financeiro/AjudaTela.js,
// renderizado em app/(portal)/dre-financeiro/layout.js) e pelo tooltip (title=) de cada
// chip da sub-nav.
//
// A chave e o MESMO href usado em GRUPOS no layout.js — ao criar/renomear uma tela,
// atualize os dois lugares. Telas sem entrada aqui simplesmente nao mostram o "?"
// (ex.: o link externo /visual-estoque/patio).
//
// Cada entrada:
//   titulo     -> nome da aba (igual ao label da sub-nav)
//   icon       -> emoji da aba (igual ao da sub-nav)
//   resumo     -> 1 frase; vai no tooltip do chip e no topo do painel
//   oQueMostra -> paragrafo: o que a tela apresenta e que pergunta ela responde
//   comoUsar   -> marcadores dos filtros/cliques que existem DE VERDADE na tela
//   termos     -> mini glossario { t: termo, d: definicao } dos jargoes da tela
//
// Os textos sao voltados ao USUARIO (nada de detalhe de implementacao) e vao
// ACENTUADOS — sao exibidos na tela, ao contrario destes comentarios.

// Nota valida para todas as telas do modulo — o painel a mostra no rodape.
export const NOTA_CONTA =
  'Todos os números respeitam o seletor de Conta (NOVA / CASTRO / TODAS) aqui do cabeçalho.'

export const AJUDA = {
  // ---------------------------------------------------------------- Home ---
  '/dre-financeiro': {
    titulo: 'Home',
    icon: '🏠',
    resumo: 'Resumo executivo: os principais números do mês num painel só.',
    oQueMostra:
      'Painel de abertura do módulo. No topo, o SEMÁFORO DE SAÚDE FINANCEIRA lê a deterioração num relance — ' +
      'cada indicador com uma luz (🟢 saudável / 🟡 atenção / 🔴 crítico) e uma seta de tendência dos últimos ' +
      '3 meses; caixa vem primeiro (cobertura, juros de antecipação, ciclo de caixa, inadimplência 90+) e depois ' +
      'resultado (resultado líquido, margem líquida, despesas financeiras). Abaixo, os 6 cards grandes do momento — ' +
      'ciclo de caixa, resultado do mês (vs mês anterior), pontualidade dos últimos 30 dias, capital parado e ' +
      'vencimentos dos próximos 7 dias — e, por fim, atalhos para todas as telas agrupados por categoria.',
    comoUsar: [
      'A luz de cada tile é o retrato de agora; a seta ▲/▼ é a trajetória da saúde (não do número cru — "piorando" é sempre vermelho, mesmo quando os juros subiram).',
      'A pílula ao lado do título "Saúde Financeira" é o resumo pior-caso: fica 🔴 se qualquer sinal estiver crítico.',
      'Cada card ou tile é um atalho: clique para abrir a tela que detalha aquele número.',
      'A tendência compara a média dos 3 meses recentes com a dos 3 anteriores (o mês corrente, por ser parcial, fica de fora).',
      'Você só vê os cards e tiles das telas a que tem permissão.',
    ],
    termos: [
      { t: 'Cobertura 30 dias', d: 'Quanto você tem a receber contra o que tem a pagar nos próximos 30 dias. 🔴 abaixo de 1× (descoberto), 🟡 até 1,2× (apertado), 🟢 acima (saudável/confortável).' },
      { t: 'Juros de antecipação', d: 'Custo de descontar duplicatas (antecipar recebíveis). Subir de forma sustentada é sinal precoce de aperto de caixa.' },
      { t: 'Inadimplência 90+', d: 'Parte da carteira vencida há mais de 90 dias. 🔴 quando passa de metade da inadimplência.' },
      { t: 'Margem líquida', d: 'Resultado sobre a receita. 🔴 se cai 3 pontos ou mais contra os 3 meses anteriores.' },
      { t: 'Lucro bruto', d: 'Receita menos os custos diretos da venda (sem as despesas fixas).' },
      { t: 'Líquido (7 dias)', d: 'O que entra menos o que sai na próxima semana. Negativo = a semana pede caixa.' },
    ],
  },

  // ------------------------------------------------- Caixa & Vencimentos ---
  '/dre-financeiro/calendario': {
    titulo: 'Calendário',
    icon: '📅',
    resumo: 'Vencimentos dia a dia, mês a mês ou em lista; clique no dia para ver os títulos.',
    oQueMostra:
      'Agenda financeira: quanto vence em cada dia, em contas a pagar, a receber ou nas duas. ' +
      'Responde "que dias da semana/mês vão pesar no caixa?". Tem visão de Mês (calendário), ' +
      'de Ano (trimestres + os 12 meses em escala) e de Lista (tabela ordenável, com exportação CSV).',
    comoUsar: [
      'Escolha o tipo — A Pagar, A Receber ou Ambos — na barra de cima.',
      'Navegue com ← / → ou volte ao mês corrente em "Hoje"; alterne entre Mês, Ano e Lista.',
      'Clique num dia do calendário: abre um painel lateral com os títulos que vencem naquela data.',
      'Refine com os filtros de status, terceiro, grupo, categoria e departamento.',
      'O botão Sincronizar traz de novo os títulos do Omie para a conta selecionada.',
    ],
    termos: [
      { t: 'Título', d: 'Uma conta a pagar ou a receber (uma parcela/duplicata) vinda do Omie.' },
      { t: 'Terceiro', d: 'A contraparte do título: o cliente (a receber) ou o fornecedor (a pagar).' },
    ],
  },

  '/dre-financeiro/vencidos': {
    titulo: 'Vencidos',
    icon: '⚠️',
    resumo: 'Títulos que já passaram do vencimento, por faixa de atraso e por terceiro.',
    oQueMostra:
      'Tudo que venceu e ainda está em aberto: total vencido, quantidade de títulos, maior atraso e a ' +
      'divisão entre a pagar e a receber. Responde "quem está me devendo há mais tempo?" e ' +
      '"o que eu deixei de pagar?".',
    comoUsar: [
      'Clique numa faixa de atraso (1-30, 31-60, 61-90, 90+) para filtrar a lista por ela.',
      'Alterne entre a sub-aba Lista (todos os títulos) e Por terceiro (agrupado por cliente/fornecedor, com barra proporcional).',
      'Clique no cabeçalho de uma coluna para ordenar; clique numa linha para abrir os detalhes do título, com produtos e comentários.',
      'Exportar CSV / Baixar PDF geram o relatório do que está filtrado na tela.',
    ],
    termos: [
      { t: 'Atraso médio', d: 'Média de dias entre o vencimento e hoje, considerando os títulos ainda em aberto.' },
      { t: 'Ticket médio', d: 'Valor vencido dividido pela quantidade de títulos.' },
      { t: 'Em aberto', d: 'A parte do título que ainda não foi paga/recebida.' },
    ],
  },

  '/dre-financeiro/curva-saldo': {
    titulo: 'Curva de Saldo',
    icon: '📉',
    resumo: 'Projeção do saldo dia a dia a partir de um saldo inicial que você informa.',
    oQueMostra:
      'Simulação do caixa futuro: partindo do saldo inicial digitado, soma o que entra e subtrai o que sai ' +
      'em cada dia da janela. Responde "em que dia eu fico no vermelho?". Mostra saldo final, saldo mínimo ' +
      '(e a data), total de entradas e saídas e quantos dias ficam negativos.',
    comoUsar: [
      'Digite o saldo inicial (o saldo real das contas hoje), escolha a janela (30 a 365 dias) e clique em Aplicar.',
      'Se houver saldo negativo, aparece um alerta com o primeiro dia em que isso acontece.',
      'Clique numa barra ou num ponto do gráfico — ou numa linha da tabela "Dias com movimento" — para ver os títulos daquele dia.',
    ],
    termos: [
      { t: 'Saldo inicial', d: 'Quanto você tem em conta hoje. A projeção só faz sentido se este valor estiver certo.' },
      { t: 'Saldo mínimo', d: 'O ponto mais baixo da curva na janela — o momento de maior aperto.' },
    ],
  },

  '/dre-financeiro/fluxo': {
    titulo: 'Fluxo',
    icon: '🌊',
    resumo: 'O caminho do dinheiro (Sankey ou treemap) e a comparação entre anos.',
    oQueMostra:
      'Para onde o dinheiro vai, em três visões: Sankey (grupo → categoria → principais terceiros), ' +
      'Treemap (cada retângulo é uma categoria, com área proporcional ao valor) e Comparativo ano a ano ' +
      '(tabela com barras por ano e variação %). Responde "onde estou gastando de verdade?".',
    comoUsar: [
      'Escolha o período: mês, ano corrente até hoje, ano anterior, ano completo, tudo, intervalo personalizado ou comparar anos lado a lado.',
      'Alterne a visualização entre Sankey, Treemap e Comparativo.',
      'Clique num nó do Sankey ou num retângulo do treemap para abrir o detalhamento (principais terceiros e títulos).',
    ],
    termos: [
      { t: 'Grupo / Categoria', d: 'A classificação contábil do Omie: o grupo reúne várias categorias (ex.: "Custos Diretos").' },
      { t: 'Sankey', d: 'Diagrama de fluxo: a espessura da faixa é proporcional ao valor que passa por ela.' },
    ],
  },

  '/dre-financeiro/movimentos': {
    titulo: 'Movimentações CC',
    icon: '🏦',
    resumo: 'Extrato das contas correntes vindo do Omie (entradas, saídas e saldo do período).',
    oQueMostra:
      'O extrato financeiro de verdade — o dinheiro que efetivamente entrou e saiu das contas correntes, ' +
      'com entradas, saídas, saldo do período e a quantidade de movimentos. É a visão de CAIXA, ' +
      'diferente das telas baseadas em títulos (previsto). Esta tela fica fora da barra de abas: ' +
      'acessa-se pelo link direto /dre-financeiro/movimentos.',
    comoUsar: [
      'Escolha o período (há atalhos rápidos) e filtre por natureza, conta corrente ou busca livre.',
      'Clique no cabeçalho da coluna para ordenar; verde é entrada, vermelho é saída.',
      'Sincronizar traz do Omie os movimentos do período filtrado (pela data de pagamento).',
      'Exportar CSV baixa o que está na tela.',
    ],
    termos: [
      { t: 'Natureza', d: 'Se o movimento é recebimento (R) ou pagamento (P).' },
      { t: 'Antecipação', d: 'Venda de duplicatas ao banco para receber antes; entra como movimento e gera juros.' },
    ],
  },

  // --------------------------------------------- Prazos & Eficiencia ------
  '/dre-financeiro/ciclo-caixa': {
    titulo: 'Ciclo de Caixa',
    icon: '🔄',
    resumo: 'Quantos dias o dinheiro fica preso entre pagar o fornecedor e receber do cliente.',
    oQueMostra:
      'DSO, DIO, DPO e o ciclo de caixa (CCC), consolidados e por empresa, mais uma linha do tempo ' +
      'que desenha o percurso do dinheiro e um texto interpretando o resultado. Responde ' +
      '"quantos dias eu preciso financiar a operação com dinheiro próprio?".',
    comoUsar: [
      'Leia primeiro o CCC (card escuro): quanto menor, melhor — negativo significa que você recebe antes de pagar.',
      'A linha do tempo mostra o peso de cada etapa: estoque parado (DIO), espera do cliente (DSO) e prazo do fornecedor (DPO).',
      'Passe o mouse sobre o "i" de cada card para a definição rápida.',
    ],
    termos: [
      { t: 'DSO', d: 'Dias médios para receber dos clientes.' },
      { t: 'DIO', d: 'Dias médios que o produto fica parado em estoque.' },
      { t: 'DPO', d: 'Dias médios que você leva para pagar os fornecedores.' },
      { t: 'CCC', d: 'Ciclo de caixa = DSO + DIO − DPO. É o buraco que a empresa financia sozinha.' },
    ],
  },

  '/dre-financeiro/aderencia': {
    titulo: 'Pontualidade',
    icon: '⏱️',
    resumo: 'O previsto bateu com o realizado? Pontualidade, atraso médio e maiores desvios.',
    oQueMostra:
      'Compara a data prevista de vencimento com a data em que o título foi de fato pago/recebido. ' +
      'Responde "dá para confiar na minha previsão de caixa?". Traz a pontualidade (%), o atraso médio, ' +
      'o percentual no prazo e atrasado, o valor em atraso e uma barra de distribuição (no prazo / ' +
      'antecipado / atrasado / não pago).',
    comoUsar: [
      'Ajuste a janela (30 a 730 dias) e a granularidade (mês ou semana) na barra de cima.',
      'O gráfico cruza Previsto x Realizado (barras, em R$) com o atraso médio (linha, em dias).',
      'A tabela "Top desvios" lista os casos que mais fugiram do previsto; clique no cabeçalho para ordenar.',
    ],
    termos: [
      { t: 'Pontualidade (aderência)', d: 'Percentual de títulos liquidados na data prevista.' },
      { t: 'Antecipado', d: 'Pago ou recebido antes do vencimento.' },
      { t: 'Não pago', d: 'Já venceu no período analisado e continua em aberto.' },
    ],
  },

  // ------------------------------------------------------- Resultado ------
  '/dre-financeiro/dre': {
    titulo: 'DRE',
    icon: '📋',
    resumo: 'A DRE consolidada mês a mês, por competência ou pelo regime do Omie.',
    oQueMostra:
      'O demonstrativo de resultado completo: receitas, custos, despesas e o lucro, numa tabela ' +
      'hierárquica (tipo → grupo → conta → categoria) com colunas NOVA, CASTRO e Consolidado, mais uma ' +
      'coluna por mês. Abaixo, a evolução das despesas em linhas alinhadas com a tabela.',
    comoUsar: [
      'Alterne o regime entre Competência (padrão — o valor cai no mês do fato) e Omie (o valor cai no mês do pagamento).',
      'Clique nas linhas da tabela para abrir/fechar os níveis; clique numa célula para o detalhamento com a lista de movimentos.',
      'No gráfico de despesas, ligue/desligue linhas na legenda — "Pagamento de Empréstimos" vem desligado de propósito, para não achatar as demais.',
      'Marque "esconder devoluções" para ler o mês sem as devoluções de venda: a linha sai da tabela e todos os números (KPIs, cascata, gráficos, CSV) são recalculados. Um aviso mostra quanto ficou de fora.',
      'Exportar CSV baixa a tabela como está na tela.',
    ],
    termos: [
      { t: 'Competência', d: 'O valor pertence ao mês em que o fato aconteceu (a venda/o serviço), não ao mês do pagamento.' },
      { t: 'Regime Omie', d: 'O valor pertence ao mês em que o dinheiro entrou/saiu — a visão de caixa do Omie.' },
      { t: 'Intercompany', d: 'Operações entre NOVA e CASTRO, separadas para não inflar o consolidado.' },
      { t: 'Deduções de Receita', d: 'As devoluções de venda, que abatem a receita bruta. Escondê-las dá uma leitura da operação sem o vai-e-vem, mas deixa de ser a DRE padrão.' },
    ],
  },

  '/dre-financeiro/analise-dre': {
    titulo: 'Análise DRE',
    icon: '🔬',
    resumo: 'A leitura da DRE: variações mês a mês e contra o ano passado, outliers e alertas.',
    oQueMostra:
      'A camada de interpretação da DRE. Em vez dos valores brutos, mostra como cada linha variou em ' +
      'relação ao mês anterior (MoM) e ao mesmo mês do ano passado (YoY), aponta valores fora do padrão ' +
      'e resume tudo em insights. Responde "o que mudou e vale a pena investigar?".',
    comoUsar: [
      'Escolha o regime (competência ou Omie) e a granularidade (mês, trimestre, ano).',
      'Troque o modo de margem para ver os percentuais sobre a base que interessa.',
      'Use os botões da tabela para mostrar/esconder colunas e linhas.',
      'Leia os insights no topo: eles já apontam as variações que fugiram do normal.',
    ],
    termos: [
      { t: 'MoM', d: 'Month over month — variação em relação ao mês anterior.' },
      { t: 'YoY', d: 'Year over year — variação em relação ao mesmo mês do ano passado.' },
      { t: 'Z-score', d: 'Mede quantos desvios-padrão um valor está da média. Alto = mês atípico.' },
    ],
  },

  '/dre-financeiro/composicao': {
    titulo: 'Composição',
    icon: '🧩',
    resumo: 'Treemap de para onde foi o dinheiro do mês, categoria por categoria.',
    oQueMostra:
      'A "fatia" de cada categoria dentro do mês: total do mês, quantos grupos e categorias tiveram ' +
      'movimento e qual foi a maior categoria (com valor e percentual). O treemap desenha cada categoria ' +
      'como um retângulo proporcional, colorido pelo grupo a que pertence.',
    comoUsar: [
      'Navegue entre os meses com ← / → ou volte ao atual com Hoje.',
      'Escolha o tipo: A Pagar, A Receber ou Ambos — os botões Todos / Saídas / Entradas da legenda fazem exatamente a mesma coisa.',
      'Clique num cartão da faixa de natureza (Receitas, Custos, Despesas...) para ver só aquela parte do mês.',
      'Clique num grupo da legenda (ex.: "Despesas com Pessoal") para o treemap se remontar só com ele; clique de novo para voltar a todos.',
      'Marque "Esconder devoluções" para tirar as devoluções dos dois lados — elas somem do treemap, dos KPIs e da faixa de natureza.',
      'Clique num retângulo do treemap: abre os 10 maiores terceiros daquela categoria (o restante vira "+ N outros"). Esc fecha.',
    ],
    termos: [
      { t: 'Treemap', d: 'Gráfico de retângulos: a área de cada um é proporcional ao valor.' },
      { t: 'Grupo', d: 'O agrupamento contábil acima da categoria; aqui define a cor do retângulo e serve de filtro na legenda.' },
      { t: 'Devoluções', d: 'Aparecem dos dois lados: "Devoluções de Vendas" como saída e "Devoluções" / "DevoluçõeseOutras Saidas" como entrada.' },
    ],
  },

  // ------------------------------------------------------ Patrimonio ------
  '/dre-financeiro/patrimonio': {
    titulo: 'Patrimônio',
    icon: '💰',
    resumo: 'O que a empresa tem menos o que deve, com a evolução ao longo do tempo.',
    oQueMostra:
      'O patrimônio operacional: estoque de peças, estoque de máquinas, frota e contas a receber (ativos) ' +
      'contra as contas a pagar (passivo). Traz a composição dos ativos, um balanço visual com a cobertura ' +
      'das obrigações, o ciclo de caixa resumido e a evolução histórica.',
    comoUsar: [
      'Todos os cards são clicáveis: abrem o detalhamento do item — em "a receber"/"a pagar" dá para descer até o cliente/fornecedor e, dali, até a ficha completa do título.',
      'No gráfico de evolução, escolha a janela; a linha tracejada mostra a corrosão pela SELIC quando disponível.',
      '"Salvar snapshot diário" grava a foto de hoje; "Reconstruir histórico" refaz a série passada (demora).',
    ],
    termos: [
      { t: 'Patrimônio operacional', d: 'Ativos da operação menos as obrigações. Não é o balanço contábil oficial.' },
      { t: 'Cobertura', d: 'Quanto dos compromissos de cada janela de vencimento está coberto pelos ativos.' },
      { t: 'Corrosão SELIC', d: 'Quanto o patrimônio perde de valor por ficar parado, comparado a render a SELIC.' },
      { t: 'Snapshot', d: 'Foto do patrimônio num dia — é o que forma a série histórica.' },
    ],
  },

  '/dre-financeiro/rentabilidade': {
    titulo: 'Rentabilidade',
    icon: '📊',
    resumo: 'Duas visões numa tela: margem por venda e capital parado em estoque.',
    oQueMostra:
      'Junta as duas perguntas de rentabilidade em abas: "Margens por venda" (quanto sobrou em cada venda, ' +
      'já descontando o custo do produto e o capital que ficou empatado até vender) e "Capital parado" ' +
      '(quanto dinheiro está dormindo no estoque e quanto isso custa por mês).',
    comoUsar: [
      'Alterne entre as abas "Margens por venda" e "Capital parado" no topo — a aba escolhida fica no endereço, então dá para salvar o link.',
      'Cada aba tem os mesmos controles das telas Margens e Lucratividade (período, família, SELIC) e a tabela detalhada.',
      'Estas mesmas visões existem em telas próprias: Margens e Lucratividade.',
    ],
    termos: [
      { t: 'Capital empatado', d: 'O custo de ter deixado dinheiro parado no produto até ele ser vendido.' },
      { t: 'CMV', d: 'Custo da mercadoria vendida — quanto o item vendido custou para a empresa.' },
    ],
  },

  '/dre-financeiro/lucratividade': {
    titulo: 'Lucratividade',
    icon: '📈',
    resumo: 'Capital parado, margem bruta e o simulador "e se eu liquidasse o estoque parado?".',
    oQueMostra:
      'Três blocos. 1) Capital parado em estoque: quanto vale o que não gira, o custo de oportunidade ' +
      'desse dinheiro, quantos produtos estão parados e o percentual do estoque. 2) Margem bruta ' +
      'operacional: receita, CMV, lucro e margem % ao longo do tempo. 3) Simulador what-if: o efeito de ' +
      'liquidar parte do estoque parado com desconto.',
    comoUsar: [
      'No bloco 1, escolha a família, o corte de "sem giro há" (90 dias até desde jan/23) e a SELIC ao mês, e clique em Aplicar.',
      'No bloco 2, ajuste período e granularidade (mês, semestre, ano) e confira a cobertura de CMC.',
      'No simulador, mexa nos controles de % a liquidar, % de desconto e horizonte — o gráfico compara "sem ação" e "com ação". É só simulação: nada é alterado.',
    ],
    termos: [
      { t: 'Custo de oportunidade', d: 'O que aquele dinheiro renderia a SELIC se não estivesse parado no estoque.' },
      { t: 'Sem giro', d: 'Produto sem nenhuma venda no período escolhido.' },
      { t: 'Cobertura CMC', d: 'Quantas vendas têm custo unitário conhecido. Cobertura baixa deixa a margem menos confiável.' },
    ],
  },

  '/dre-financeiro/margens': {
    titulo: 'Margens',
    icon: '🧮',
    resumo: 'A margem real de cada venda: receita menos o custo e o capital empatado até vender.',
    oQueMostra:
      'A margem venda a venda, descontando não só o CMV mas também o custo de ter o dinheiro parado no ' +
      'produto até a venda. Abre num seletor com dois caminhos: por FAMÍLIA (a margem média de cada uma) ' +
      'e por DATA (a variação mês a mês das famílias de máquinas). A tabela detalhada continua acessível ' +
      'pelo link abaixo do seletor.',
    comoUsar: [
      'Clique numa família para ver, no popup, as vendas e as datas que formam aquela média.',
      'Na visão por data, marque a caixa de peças para incluí-las (por padrão só máquinas).',
      'Na visão clássica: ajuste período e SELIC e clique em Aplicar; filtre por família, busca (código, descrição, cliente, vendedor) e faixa de margem; clique numa linha para o detalhe da venda.',
      'Se aparecer o aviso de cobertura CMC, há vendas sem custo unitário — a margem delas fica incompleta.',
    ],
    termos: [
      { t: 'Margem real', d: 'Receita − (CMV + capital empatado). Mais dura que a margem bruta comum.' },
      { t: 'CMC', d: 'Custo médio de compra do produto, vindo do Omie.' },
      { t: 'SELIC', d: 'Taxa usada para calcular quanto custou o dinheiro parado no produto.' },
    ],
  },

  // -------------------------------------------------------- Comercial -----
  '/dre-financeiro/vendas-modelo': {
    titulo: 'Vendas/Modelo',
    icon: '🏷️',
    resumo: 'Quais modelos de máquina vendem, quanto e em que meses.',
    oQueMostra:
      'As vendas abertas por modelo (ou por faixa de potência): quantos modelos distintos, quantos eventos ' +
      'de venda, a quantidade total e a receita. Traz a evolução mensal e uma tabela pivotada com uma linha ' +
      'por modelo e uma coluna por mês, com mapa de calor.',
    comoUsar: [
      'Escolha o período (3 a 36 meses ou desde uma data) e a métrica: receita, quantidade ou eventos.',
      'Filtre por família (com os atalhos "todas as máquinas" e "só peças"), modelo, busca livre e Top N.',
      'Alterne entre Tabela pivotada e Grade anual, e entre agrupar Por modelo ou Por potência.',
      'Clique numa célula da tabela para ver as vendas daquele modelo naquele mês.',
      '"Sincronizar modelos do Omie" atualiza o cadastro de modelos em segundo plano.',
    ],
    termos: [
      { t: 'Evento de venda', d: 'Uma ocorrência de venda do modelo (uma nota/item), independente da quantidade.' },
      { t: 'Por potência', d: 'Agrupa os modelos por faixa de cavalos (cv) em vez de pelo nome do modelo.' },
    ],
  },

  '/dre-financeiro/clientes': {
    titulo: 'Clientes',
    icon: '👥',
    resumo: 'Curva ABC de receita e ranking de inadimplência por cliente.',
    oQueMostra:
      'Quem sustenta o faturamento e quem dá problema. A análise ABC ordena os clientes por receita e ' +
      'mostra a concentração (poucos clientes respondem pela maior parte). Ao lado, o ranking de ' +
      'inadimplência. NOVA e CASTRO são consolidadas pelo CNPJ, então o mesmo cliente não aparece duas vezes.',
    comoUsar: [
      'Leia a curva ABC de cima para baixo: os clientes do topo são os de maior risco de concentração.',
      'No ranking de inadimplência, comece pelos maiores valores em aberto.',
    ],
    termos: [
      { t: 'Curva ABC', d: 'Classificação por peso: A = poucos clientes que fazem a maior parte da receita; C = a cauda longa.' },
      { t: 'Concentração', d: 'Quanto da receita depende dos maiores clientes. Alta concentração = risco se um deles sair.' },
    ],
  },

  // -------------------------------------------------------- Qualidade -----
  '/dre-financeiro/monitor': {
    titulo: 'Monitor',
    icon: '🛡️',
    resumo: 'Robôs que apontam cadastros com problema no Omie (sem categoria, valor zerado...).',
    oQueMostra:
      'Controle de qualidade dos dados. Robôs varrem Contas a Pagar, Contas a Receber, Faturamento e ' +
      'Compras procurando anomalias — título sem fornecedor, sem categoria, sem departamento, valor ' +
      'zerado, custo (CMC) ausente — e listam tudo por severidade. Como as demais telas leem esses mesmos ' +
      'dados, o que for corrigido aqui melhora todos os relatórios.',
    comoUsar: [
      'Cada card mostra as anomalias abertas do módulo; "Rodar agora" refaz a varredura só dele, e "Rodar todos os robôs agora" refaz todas.',
      'Filtre a tabela por módulo e situação.',
      'Em cada anomalia dá para ignorar, marcar como resolvida ou reabrir.',
      '"Últimas execuções dos robôs" diz quando cada varredura rodou pela última vez.',
    ],
    termos: [
      { t: 'Anomalia', d: 'Um registro do Omie que quebra uma regra de cadastro esperada.' },
      { t: 'Severidade', d: 'Alta, média ou baixa — o quanto aquele problema distorce os relatórios.' },
      { t: 'Ignorar', d: 'Marca a anomalia como aceitável; ela sai da lista sem precisar ser corrigida no Omie.' },
    ],
  },
}

// Ajuda da tela correspondente ao pathname atual (null quando nao ha —
// ex.: links externos da sub-nav ou telas ainda sem texto de ajuda).
export function ajudaDaTela(pathname) {
  if (!pathname) return null
  return AJUDA[pathname] || null
}
