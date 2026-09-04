// Textos de AJUDA das telas do módulo de Sugestão de Compra.
//
// Consumidos pelo botão "?" (components/estoque/AjudaCompras.tsx) ao lado do título de
// /estoque/sugestao-compra e /estoque/config-compras. Só texto, sem React.
//
// Tudo aqui foi conferido no código (motor.ts, snapshot.ts, rotas e páginas). Se mudar
// uma coluna, um chip, um campo ou uma regra do motor, atualize a entrada correspondente.
// Os textos são voltados ao USUÁRIO e vão acentuados — são exibidos na tela.

export interface AjudaTabela {
  cabecalho: [string, string];
  linhas: Array<[string, string]>;
}

export interface AjudaSecao {
  titulo: string;
  paragrafos?: string[];
  itens?: string[];
  tabela?: AjudaTabela;
  nota?: string; // caixa âmbar no fim da seção
}

export interface AjudaTela {
  titulo: string;
  resumo: string;
  secoes: AjudaSecao[];
}

// ---------------------------------------------------------------------------
// /estoque/sugestao-compra
// ---------------------------------------------------------------------------
export const AJUDA_SUGESTAO: AjudaTela = {
  titulo: 'Sugestão de Compra',
  resumo: 'Reposição de peças calculada toda madrugada, consolidando NOVA + CASTRO por SKU.',
  secoes: [
    {
      titulo: 'De onde vêm os números',
      paragrafos: [
        'Toda madrugada (03:30) um robô gera um "snapshot": a foto do cálculo para todos os SKUs de peças das duas contas. ' +
        'A tela lê sempre o último snapshot; a data aparece no subtítulo. Nada aqui é calculado ao vivo, exceto o painel "ver".',
        'Para cada produto o robô olha os últimos 12 meses de saídas por VENDA (balcão e OS faturada). Devoluções, remessas, ' +
        'ajustes de inventário e fretes ficam de fora. Meses em que o produto ficou sem estoque são corrigidos para cima ' +
        '(a venda que não aconteceu por falta não é falta de procura), com teto de 2 vezes.',
        'Sobre essa série entra o índice sazonal do Tipo da peça (rolamentos vendem mais em novembro, por exemplo), a curva ' +
        'ABC pelo faturamento dos 12 meses e os parâmetros da tela Config. de Compras. As duas contas são somadas por SKU: ' +
        'estoque, demanda e histórico viram um só, e a sugestão é uma só.',
      ],
      nota: 'Estoque negativo em uma conta (erro de reconciliação) é tratado como zero. Ele não infla a compra, mas o valor cru continua visível na dica da coluna Estoque.',
    },
    {
      titulo: 'Aba Sugestões: fornecedor e chips',
      paragrafos: [
        'O seletor Fornecedor é o eixo principal da tela: escolha um para ver só os SKUs cujo fornecedor preferencial é ele. ' +
        '"Não definido" reúne os SKUs sem fornecedor preferencial. O número entre parênteses é a quantidade de SKUs.',
        'Os chips abaixo recortam a lista dentro do fornecedor escolhido. Vários chips ligados combinam em "E": o item precisa ' +
        'atender a todos. O número em cada chip é quantos itens ele pegaria no recorte atual. "limpar" desliga todos.',
      ],
      tabela: {
        cabecalho: ['Chip', 'O que seleciona'],
        linhas: [
          ['Já era', 'Alerta "Já era": o estoque acaba antes de um pedido feito hoje chegar.'],
          ['Crítico', 'Alerta "Crítico": o estoque acaba dentro dos 45 dias da janela de decisão.'],
          ['Atenção', 'Alerta "Atenção": acaba em menos de 90 dias, ou há sugestão de compra.'],
          ['Abaixo do mínimo', 'Estoque + trânsito menor que o mínimo efetivo (e mínimo maior que zero).'],
          ['Zerado com demanda', 'Estoque zero ou negativo, mas com demanda prevista nos próximos 45 dias.'],
          ['Sem giro 12m', 'Sem venda prevista (não vendeu em 12 meses) mas com estoque em alguma conta. Candidato a liquidar.'],
          ['Entrando na safra', 'Índice sazonal dos próximos 45 dias de 1,15 ou mais: o Tipo vende acima da média nesta época.'],
          ['Saindo da safra', 'Índice sazonal de 0,85 ou menos: o Tipo vende abaixo da média nesta época.'],
          ['Tem no outro pátio', 'Zerado numa conta e com estoque na outra. Vale transferir antes de comprar. Peça cadastrada só numa empresa também entra aqui (conta zero na outra); combine com o filtro Empresa = Ambas para ver só os casos em que a transferência é possível.'],
          ['Sem tipo', 'Peça sem "Tipo" cadastrado. Sem tipo não há índice sazonal (fica neutro).'],
        ],
      },
    },
    {
      titulo: 'Colunas da tabela',
      paragrafos: [
        'Clique num cabeçalho para ordenar. O ícone de filtro abre as opções: em coluna de texto é uma lista para marcar; em coluna numérica dá para filtrar por "maior que" e "menor que".',
      ],
      tabela: {
        cabecalho: ['Coluna', 'Significado'],
        linhas: [
          ['SKU', 'Código da peça. É a chave que une as duas contas (o código interno do Omie é diferente em cada uma).'],
          ['Descrição', 'Descrição do cadastro. Passe o mouse para ver completa.'],
          ['Tipo', 'Classificação manual da peça (Rolamentos, Filtros...). Define o índice sazonal.'],
          ['Empresa', 'Em qual conta o SKU está cadastrado: NOVA, CASTRO ou Ambas.'],
          ['Curva', 'Classe ABC pelo faturamento dos últimos 12 meses. Se as contas divergem, vale a melhor.'],
          ['Regime', 'Como o item é tratado: "estatístico" (vendeu em 4 ou mais dos 12 meses; ganha estoque de segurança), "intermitente" (1 a 3 meses; sem colchão estatístico) ou "sem_historico" (0 meses; fica fora da sugestão).'],
          ['Estoque', 'Soma das duas contas. Passe o mouse para ver o valor de cada uma.'],
          ['Trânsito', 'Quantidade já pedida e ainda não recebida. Na versão atual é sempre zero (o pedido daqui não abate).'],
          ['Mínimo', 'Mínimo efetivo: o estoque de segurança calculado, ou o mínimo manual da Config. quando ele estiver válido.'],
          ['Prev 30·60·90', 'Demanda prevista para os próximos 30, 60 e 90 dias, já com sazonalidade.'],
          ['Sugestão', 'Quantidade a comprar, já arredondada para cima ao múltiplo de embalagem. Verde quando maior que zero.'],
          ['Valor est.', 'Sugestão multiplicada pelo custo médio (CMC) da conta líder.'],
          ['Alerta', 'Semáforo de ruptura (tabela abaixo).'],
          ['ver', 'Abre o painel com a memória de cálculo do SKU.'],
        ],
      },
    },
    {
      titulo: 'Alertas',
      paragrafos: ['O alerta compara a cobertura (estoque + trânsito dividido pelo consumo diário) com o lead time e com a janela de 45 dias.'],
      tabela: {
        cabecalho: ['Alerta', 'Quando aparece'],
        linhas: [
          ['Já era', 'A cobertura em dias é menor que o lead time: mesmo pedindo hoje, o estoque acaba antes de chegar.'],
          ['Crítico', 'A cobertura é menor que 45 dias (lead de 30 + ciclo de 15): rompe dentro da janela que o pedido deveria cobrir.'],
          ['Atenção', 'A cobertura é menor que 90 dias, ou não há consumo mas a conta fechou com sugestão maior que zero.'],
          ['OK', 'Cobertura de 90 dias ou mais e nada a comprar.'],
          ['Não comprar', 'Item marcado como sob encomenda, ou sem histórico de venda em 12 meses e sem mínimo manual.'],
        ],
      },
    },
    {
      titulo: 'Painel "ver": memória de cálculo',
      paragrafos: [
        'Para cada conta mostra estoque, consumo por dia, demanda de 45 dias e 12 barras, uma por mês. Barra âmbar é mês em que o produto ficou sem estoque em algum dia (a demanda daquele mês foi corrigida). "sazonal" ao lado do Tipo indica que o índice sazonal foi aplicado.',
        'Abaixo vem a memória do consolidado: cada número intermediário com o nome e a origem (matriz, config, regularidade, medido...). É o lugar para conferir por que a sugestão deu o que deu.',
        'Este painel calcula ao vivo com os dados de agora, então pode diferir um pouco do snapshot da madrugada.',
      ],
    },
    {
      titulo: 'Como o cálculo funciona',
      itens: [
        'Sugestão = demanda dos próximos 45 dias + mínimo efetivo − estoque − trânsito. Se der negativo, é zero. Depois arredonda para cima ao múltiplo de embalagem.',
        'Mínimo efetivo: se houver mínimo manual válido na Config., é ele. Senão é o estoque de segurança, calculado só no regime estatístico a partir da variação da demanda, do lead time e da variação do lead time.',
        'Nível de serviço (quanto colchão): pela matriz curva × frequência. A: 97% (vende em 9+ meses) ou 95% (4 a 8 meses); B: 95% ou 92%; C: 95% ou 88%. Item crítico força 98%. Intermitente não tem colchão.',
        'Lead time: primeiro o "lead override" do item, senão o lead declarado do fornecedor preferencial, senão 30 dias. Quando o item tem 8 ou mais entregas recebidas pela aba Pedidos abertos, o lead medido substitui os três.',
        'Variação do lead: com lead medido, é a variação real. Sem ele, vem da Regularidade do fornecedor: regular 15%, irregular 30%, muito irregular 50% do lead.',
      ],
    },
    {
      titulo: 'Gerar pedido',
      itens: [
        'Marque os itens pela caixa da primeira coluna. O rodapé verde soma itens, unidades e valor estimado.',
        'Escolha a conta compradora (NOVA ou CASTRO). Cada linha vai com o código interno daquela conta; item que não existe na conta escolhida é ignorado e a mensagem avisa quantos ficaram de fora.',
        'Escolha o destino: "Novo pedido" ou um pedido já aberto da mesma conta (o item que já existir lá é somado, não duplicado).',
        'O fornecedor gravado no pedido é o do seletor no topo, se houver um selecionado.',
        'Nada é enviado ao Omie: o pedido vive só no portal, para acompanhar e receber.',
      ],
    },
    {
      titulo: 'Aba Pedidos abertos',
      paragrafos: ['Lista os pedidos ainda não concluídos das duas contas.'],
      tabela: {
        cabecalho: ['Coluna / ação', 'Significado'],
        linhas: [
          ['Pedido, Conta, Fornecedor, Data', 'Identificação do pedido e a conta que comprou.'],
          ['Itens', 'Quantidade de linhas (SKUs) no pedido.'],
          ['Pedida × Recebida', 'Soma das unidades pedidas e das já recebidas.'],
          ['Dias', 'Dias desde a data do pedido. Um "!" vermelho marca pedido aberto há mais de 60 dias.'],
          ['Status', '"enviado" ao criar; "recebido_parcial" quando alguma linha entrou; "concluido" quando todas as linhas foram atendidas.'],
          ['PDF', 'Abre o pedido em PDF numa nova aba, para mandar ao fornecedor.'],
          ['Receber', 'Abre o recebimento manual: data de entrada, número da NF (opcional) e a quantidade recebida por linha (já vem preenchida com o que falta). A linha fica "parcial" ou "atendida". Cada recebimento alimenta o lead time medido do item.'],
        ],
      },
      nota: 'O recebimento é manual porque a nota de entrada do Omie quase nunca traz o código interno do produto, então não dá para casar sozinho.',
    },
  ],
};

// ---------------------------------------------------------------------------
// /estoque/config-compras
// ---------------------------------------------------------------------------
export const AJUDA_CONFIG: AjudaTela = {
  titulo: 'Config. de Compras',
  resumo: 'Parâmetros de suprimento que a Sugestão de Compra lê. Sem configuração, valem os padrões.',
  secoes: [
    {
      titulo: 'Conta',
      paragrafos: [
        'Tudo nesta tela é por conta (NOVA ou CASTRO), escolhida no seletor do canto. Não existe modo "Todas": um fornecedor ou um item precisa ser configurado em cada conta onde é comprado. As alterações valem a partir do próximo snapshot da madrugada.',
      ],
    },
    {
      titulo: 'Aba Fornecedores',
      paragrafos: [
        'A lista mostra todo fornecedor que já emitiu nota de entrada na conta. No Omie, cliente e fornecedor são o mesmo cadastro; o número que identifica o fornecedor aqui é o código desse cadastro. Use a busca e a caixa "só configurados" para achar quem já tem parâmetros. "Editar" abre os campos na própria linha.',
      ],
      tabela: {
        cabecalho: ['Campo', 'Significado e se entra no cálculo hoje'],
        linhas: [
          ['Lead (dias)', 'Prazo entre pedir e receber, declarado por você. ENTRA no cálculo: é o lead usado por todo item cujo fornecedor preferencial é este, até o item acumular 8 entregas medidas.'],
          ['Regularidade', 'Quão pontual é o fornecedor. ENTRA no cálculo como variação do lead: regular = 15%, irregular = 30%, muito irregular = 50% do lead declarado. Mais variação, mais estoque de segurança.'],
          ['Ciclo (dias)', 'Intervalo entre um pedido e outro (15 na fábrica). NÃO entra ainda: o motor usa janela fixa de 45 dias.'],
          ['NS A/B/C', 'Nível de serviço por curva, de 0 a 1, que substituiria a matriz padrão. NÃO entra ainda: a matriz fixa vale para todos.'],
          ['Pedido mín. R$', 'Valor mínimo de pedido exigido pelo fornecedor. NÃO entra ainda: só fica guardado.'],
          ['Ativo', 'Marca se o fornecedor está em uso. NÃO entra ainda: só fica guardado.'],
        ],
      },
      nota: 'Ciclo, NS A/B/C, Pedido mínimo e Ativo ficam guardados para a próxima versão do motor. Hoje eles não mudam a sugestão.',
    },
    {
      titulo: 'Aba Itens',
      paragrafos: [
        'Busque por SKU ou descrição (ao menos 2 caracteres; até 100 resultados). Cada linha mostra o cadastro e os parâmetros já resolvidos para aquele item.',
      ],
      tabela: {
        cabecalho: ['Coluna', 'Significado'],
        linhas: [
          ['SKU, Descrição, Tipo, Estoque', 'Cadastro do produto na conta escolhida.'],
          ['Lead efetivo', 'O lead que o motor vai usar, com a origem entre parênteses: "override do item", "fornecedor X" ou "padrão (30)".'],
          ['Fornecedor pref.', 'Nome do fornecedor preferencial. Vazio quando o item ainda não tem um.'],
          ['Múltiplo', 'Múltiplo de embalagem. A sugestão é arredondada para cima até ele.'],
          ['Flags', 'Selos do item: "crít" = crítico (nível de serviço 98%); "enc" = sob encomenda (nunca entra na sugestão); "mín" = tem mínimo manual cadastrado.'],
          ['Editar', 'Abre os campos abaixo na própria linha.'],
        ],
      },
    },
    {
      titulo: 'Campos do editor de item',
      tabela: {
        cabecalho: ['Campo', 'Significado'],
        linhas: [
          ['Cód. fornecedor pref. (id)', 'Código do fornecedor no Omie (o mesmo "id" da aba Fornecedores). Faz o item herdar o lead e a regularidade desse fornecedor, e define a conta líder do SKU na Sugestão. Digitar aqui vence o preenchimento automático.'],
          ['Lead override (dias)', 'Lead só deste item. Vence o lead do fornecedor e o padrão de 30.'],
          ['Múltiplo embalagem', 'Caixa fechada, par, etc. A sugestão sobe até o próximo múltiplo.'],
          ['Mínimo manual', 'Substitui o estoque de segurança calculado. Exige motivo e validade; passada a validade, o motor volta ao calculado. Com mínimo manual, item sem histórico também entra na sugestão.'],
          ['Motivo / Validade', 'Obrigatórios quando há mínimo manual. Um mínimo sem prazo apodrece: por isso a data é exigida.'],
          ['crítico (NS 98%)', 'Força nível de serviço de 98% para este item, acima da matriz.'],
          ['sob encomenda', 'Item que só se compra quando alguém pede. Sai da sugestão com alerta "Não comprar".'],
        ],
      },
    },
    {
      titulo: 'Como o fornecedor preferencial é preenchido',
      itens: [
        'Automático: toda madrugada, antes do snapshot, um robô grava como preferencial o fornecedor da ÚLTIMA nota de compra de cada produto. Ele nunca sobrescreve um fornecedor que já esteja gravado.',
        'Cobertura hoje: cerca de 87% dos produtos da NOVA (Mahindra inclusa). Na CASTRO é baixa, porque as compras de lá ainda não casam o código do fornecedor com o produto.',
        'Manual: digite o código do fornecedor no editor do item. Vale sobre o automático.',
        'Na Sugestão de Compra, o SKU aparece sob o fornecedor da conta líder (a que tem preferencial). Sem preferencial em nenhuma conta, cai em "Não definido".',
      ],
    },
    {
      titulo: 'Aba Mais Vendidos',
      paragrafos: [
        'Grade 7 × 7 com os 49 SKUs do topo do último snapshot, por uma de três métricas: Quantidade 12m (unidades vendidas), Faturamento 12m (R$) ou Demanda (consumo por dia, sem sazonalidade). A estrela marca o SKU que está nas três listas.',
      ],
      itens: [
        'A borda e a bolinha do cartão são o alerta do item (Já era, Crítico, Atenção, OK, Não comprar). Cada cartão mostra a previsão de 30 dias e o estoque atual.',
        'Clique no cartão para ver o detalhe (curva, mínimo, vendido e faturamento 12m, consumo/dia).',
        'A caixa no canto seleciona para pedido. O rodapé gera um pedido novo ou adiciona a um aberto, pela conta selecionada no topo. Item sem sugestão entra com a previsão de 30 dias (mínimo 1).',
      ],
    },
    {
      titulo: 'Cascata do lead time',
      itens: [
        '1º: lead override do item.',
        '2º: lead declarado do fornecedor preferencial.',
        '3º: padrão de 30 dias.',
        'Quando o item soma 8 ou mais entregas registradas pelo botão Receber (Sugestão de Compra → Pedidos abertos), o lead medido (média real) substitui os três, e a variação passa a ser a real em vez da Regularidade.',
      ],
    },
  ],
};
