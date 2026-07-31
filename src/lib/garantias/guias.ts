// Guias passo-a-passo de solicitação de garantia, por montadora.
// Conteúdo FIXO NO CÓDIGO (decisão do usuário) — aparece no botão "?" dos
// cards da aba Montadoras e no link "Como funciona?" do drawer.
// Match por nome normalizado (lower/trim/sem acento) — adicionar novas
// montadoras é acrescentar uma entrada em GUIAS.

export interface PassoGuia {
  titulo: string;
  descricao: string;
  dica?: string;
}

// Seção extra do guia (ex.: KUHN tem processos separados pra ressarcimento de
// M.O. e serviços de terceiros, cada um com o próprio passo a passo).
export interface SecaoGuia {
  titulo: string;
  intro?: string;
  passos: PassoGuia[];
  observacoes?: string[];
}

// Acesso a portal externo da montadora (Extranet etc.) — mostrado num bloco
// destacado no topo do guia. usuario/senha são opcionais (a Tatu, por ex.,
// tem formulário aberto, sem login).
export interface AcessoPortal {
  url: string;
  usuario?: string;
  senha?: string;
  observacao?: string;
}

export interface GuiaMontadora {
  slug: string;
  titulo: string;
  resumo: string;
  documentos: string[];
  passos: PassoGuia[];
  observacoes?: string[];
  acesso?: AcessoPortal;
  manualUrl?: string;      // PDF em /public — botão "Abrir manual" no guia
  manualRotulo?: string;
  secoes?: SecaoGuia[];
}

export function normalizarNomeMontadora(nome?: string | null): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

const GUIAS: Record<string, GuiaMontadora> = {
  ipacol: {
    slug: 'ipacol',
    titulo: 'Ipacol',
    resumo:
      'A Ipacol trabalha em DUAS ETAPAS: primeiro a fábrica analisa e aprova as PEÇAS; ' +
      'o serviço é executado pelo técnico e só depois solicitamos o RESSARCIMENTO das horas ' +
      'e do deslocamento. A solicitação vai por E-MAIL, com o relato modelado pelo Tratorilson ' +
      'e os documentos anexados.',
    documentos: [
      'Fotos da OS (falha, peças, chassi, horímetro)',
      'Nota fiscal de venda do equipamento (busca automática pelo chassi)',
      'Relatório de Assistência Técnica — RAT (gerado no portal, digital ou impresso)',
      'Relato técnico formatado pelo Tratorilson (reclamação, diagnóstico e ação)',
    ],
    passos: [
      {
        titulo: 'Assuma a análise',
        descricao: 'Abra a garantia e clique em "Assumir análise". Confira as peças, horas e km sincronizados da OS.',
      },
      {
        titulo: 'Revise o relato do Tratorilson',
        descricao:
          'A IA formata reclamação, diagnóstico e ação a partir do relato do técnico. Revise e edite os textos — eles entram no corpo do e-mail e no RAT.',
        dica: 'Se o texto vier estranho, clique em "Regerar" ou edite direto nas caixas.',
      },
      {
        titulo: 'RAT (opcional)',
        descricao:
          'O Relatório de Assistência Técnica é opcional — se o serviço for nosso, imprima a versão em branco pra levar a campo ou gere o PDF preenchido. Quando a própria fábrica executa o serviço, não precisa.',
      },
      {
        titulo: 'Anexe a NF de venda',
        descricao: 'Use o botão "Buscar NF pelo chassi". Se a busca não encontrar, anexe o PDF manualmente.',
        dica: 'A NF de venda comprova a data de início da garantia do equipamento.',
      },
      {
        titulo: 'Envie a garantia à fábrica',
        descricao: 'Com montadora e checklist completos, clique em "Enviar à fábrica" — o card vai pra "Em análise da fábrica" e libera o disparo do e-mail.',
      },
      {
        titulo: 'Dispare o e-mail de solicitação',
        descricao:
          'Revise o assunto e o corpo no preview, selecione as fotos e envie. O número da garantia fica no assunto pra rastrearmos a resposta. Vídeos vão como link.',
      },
      {
        titulo: 'Registre o retorno das peças (1ª etapa)',
        descricao:
          'Quando a fábrica responder, marque as peças aprovadas e o valor pago — a garantia fica "Aguardando serviço". Se recusar tudo, ela finaliza e a cobrança ao cliente é liberada.',
      },
      {
        titulo: 'Solicite o ressarcimento (2ª etapa)',
        descricao:
          'Com o serviço executado, as horas/km atualizam da OS. Confira e clique em "Solicitar ressarcimento". Com o retorno da fábrica, finalize a garantia.',
        dica: 'Se o serviço foi nosso, anexe o RAT do atendimento antes — ele vai junto no e-mail do ressarcimento automaticamente.',
      },
    ],
    observacoes: [
      'As respostas da fábrica chegam sozinhas na seção "Conversa com a fábrica" do card (o portal lê a caixa de e-mail às 07:30 e às 12:00).',
    ],
  },

  kuhn: {
    slug: 'kuhn',
    titulo: 'KUHN',
    resumo:
      'A KUHN trabalha em DUAS ETAPAS e TUDO passa pelo portal Extranet dela (nada por e-mail): ' +
      'primeiro a Solicitação de Garantia das PEÇAS; com as peças aprovadas e o serviço executado, ' +
      'o RESSARCIMENTO de mão de obra e km entra pela MESMA aba do Extranet, mas com regras próprias. ' +
      'Serviço de terceiros (torno, solda, munck...) precisa de autorização PRÉVIA. Os detalhes, tabelas ' +
      'de valores e formulários estão no manual oficial — botão no fim deste guia.',
    acesso: {
      url: 'https://dealerportal.extranet.kuhn.com/br/pt/',
      usuario: '964N162JOA',
      senha: '29M1UER*24',
      observacao: 'Menu PÓS VENDAS → "Solicitação de garantia". O acompanhamento fica em "Acompanhamento do status de garantia".',
    },
    manualUrl: '/manuais/kuhn-manual-pos-vendas-2025.pdf',
    manualRotulo: 'Manual Pós-Vendas KUHN 2025 (valores por modelo, regras e formulários)',
    documentos: [
      'Fotos da OS: falha/peça danificada, plaqueta com o nº de série, horímetro',
      'Relatório de visita do técnico na máquina',
      'Certificado de Entrega Técnica registrado no Extranet (sem ele a KUHN nem avalia — exceto máquina em estoque)',
      'Pro ressarcimento: OS datada e ASSINADA pelo técnico e pelo cliente + fotos do atendimento',
      'Pra serviço de terceiros: orçamento/NF + e-mail de autorização prévia da KUHN',
    ],
    passos: [
      {
        titulo: 'Assuma a análise no portal',
        descricao: 'Abra a garantia aqui no portal, assuma e confira peças, horas e km sincronizados da OS. O relato do Tratorilson serve de base pro texto que você vai colar no Extranet.',
      },
      {
        titulo: 'Entre no Extranet da KUHN',
        descricao: 'Acesse o portal com as credenciais acima, menu PÓS VENDAS → "Solicitação de garantia".',
      },
      {
        titulo: 'Selecione a máquina pelo chassi',
        descricao: 'Digite o número de série KUHN da máquina e clique em Buscar; confira o modelo e selecione. Pra garantia de PEÇA de reposição (comprada no balcão), digite só "P" e busque.',
        dica: 'Peça de reposição tem garantia de 3 meses a partir da NF de venda ao cliente — anexe a cópia da NF.',
      },
      {
        titulo: 'Preencha "Seu pedido" com o Nº DA OS',
        descricao: 'Na tela de Informações Gerais: "Enviado por" = seu nome; "Seu pedido" = o NÚMERO DA OS vinculada a esta garantia (é assim que amarramos a SG da KUHN com o nosso card); e-mail = posvendas.',
        dica: 'O campo "Seu pedido" é o nosso elo de rastreio — não deixe em branco.',
      },
      {
        titulo: 'Dados da máquina',
        descricao: 'Data de entrega (vem do certificado), Data do problema, e Utilização = HORAS da máquina (confira com a foto do horímetro). Potência e Rotação do cardan NÃO precisam ser preenchidos — deixe 0 e marque "Inapropriado". Confirme os dados do proprietário na tela seguinte.',
      },
      {
        titulo: 'Lance as peças',
        descricao: 'Digite o código KUHN de cada item + quantidade e clique em Adicionar (ou "Adicionar vários" pra até 10 itens). Confira a descrição de cada código.',
        dica: 'Guarde as peças danificadas na revenda até o fim do processo — a KUHN pode pedir a devolução física.',
      },
      {
        titulo: 'Relato + fotos',
        descricao: 'No campo de comentários descreva a falha, a provável causa e as ações tomadas (use o relato formatado pelo Tratorilson). Anexe as fotos da falha, da plaqueta e do horímetro + o relatório de visita. Fotos em JPG de até 1024x768 e 200 Kb; vídeo não anexa — envie por e-mail ao analista da região.',
      },
      {
        titulo: 'Confirme e anote o número da SG',
        descricao: 'Confirme os dados — o Extranet gera o número da solicitação (ex.: 3 3 7560398). Anote esse número no card da garantia aqui no portal (campo de observações/checklist) pra rastrearmos a resposta.',
      },
      {
        titulo: 'Acompanhe o estado e registre o retorno (1ª etapa)',
        descricao: 'Em "Consulta do estado de Garantia": Z = sem análise, A = em análise, C = APROVADA (total/parcial), R = rejeitada, I = incompleta. Com a decisão da fábrica, registre o retorno das peças no card — a garantia fica "Aguardando serviço".',
        dica: 'Na lupa da SG, cada peça recebe uma decisão: A = aceita · B = rejeitada · C = comentários · D = DEVOLVER a peça física.',
      },
      {
        titulo: 'Solicite o ressarcimento (2ª etapa)',
        descricao: 'Com o serviço executado, confira horas/km da OS no card e siga a seção "Ressarcimento de mão de obra e km" abaixo — entra pela mesma aba do Extranet, com regras e prazos próprios. Com tudo pago, finalize a garantia no portal.',
      },
    ],
    secoes: [
      {
        titulo: 'Ressarcimento de mão de obra e km (2ª etapa)',
        intro:
          'Entra pela MESMA aba "Solicitação de garantia" do Extranet, mas só vale pra equipamentos cobertos ' +
          'pela política (tabela de valores por modelo no manual — em geral autopropelidos, plantadoras/semeadoras ' +
          'grandes, enfardadoras e misturadores; modelos menores NÃO têm). Valores de referência: R$ 130/h de M.O. ' +
          'e R$ 1,50/km. PRAZO MÁXIMO: 10 dias após a execução do serviço.',
        passos: [
          {
            titulo: 'Confira se o modelo tem ressarcimento',
            descricao: 'Abra a tabela "Valores praticados para pagamentos por modelos" no manual (seção 4.1). Se o modelo estiver com "-", não há ressarcimento de M.O./km — só as peças.',
          },
          {
            titulo: 'Use o código de serviço certo',
            descricao: 'Lance como item da solicitação o código do serviço: B0C405 = Mão de Obra · B0C406 = KM rodado · B0C402 = Entrega Técnica · B0C403 = Revisão Zero Hora · B0C407 = Serviços de Terceiros.',
          },
          {
            titulo: 'Texto PADRÃO no campo "Provável causa e solução"',
            descricao: 'Obrigatório, nesta ordem: data do atendimento; nº da Ordem de Serviço; nome do técnico; nº da SG das peças (OBRIGATÓRIO se houve troca de peça); horas de M.O. detalhadas (início/fim do trabalho, início/fim do intervalo de refeição e total — por dia, se levar mais de um); km inicial e final; descrição completa do atendimento.',
            dica: 'Exemplo do manual: "Dia dd/mm/aaaa – 4:45 horas de M.O - Horas trabalhadas: 08:45 as 11:50 – Intervalo 12h00–13h00 – 13:10 as 14:50".',
          },
          {
            titulo: 'Anexos obrigatórios',
            descricao: 'Fotos do atendimento (evidências do serviço), foto do horímetro e a OS do revendedor datada e ASSINADA pelo técnico e pelo cliente. Documento rasurado/ilegível a KUHN não analisa.',
          },
        ],
        observacoes: [
          'O técnico precisa ter treinamento KUHN Módulo I válido (2 anos) — senão o serviço não é ressarcido.',
          'Revisão Zero Hora e Entrega Técnica no MESMO dia não pagam (duração mínima de 8h cada). Zero Hora paga 1x por chassi e exige o formulário do Google Forms preenchido ANTES da solicitação.',
          'Atendimento com 2 técnicos: o tempo deve cair proporcionalmente e só paga 1 deslocamento.',
          'Troca de peças sem SG aprovada e máquina sem Certificado de Entrega Técnica não são ressarcidas.',
        ],
      },
      {
        titulo: 'Serviços de terceiros (torno, solda, munck, pintura...)',
        intro: 'Só é ressarcido com autorização PRÉVIA da KUHN — serviço feito antes de autorizar não é pago.',
        passos: [
          {
            titulo: 'Peça a autorização ANTES de executar',
            descricao: 'Solicite o formulário Excel "Solicitação para Serviços Terceirizados" ao coordenador da região ou por servicos.posvendas@kuhn.com. Envie preenchido com o orçamento original + fotos do horímetro, da falha e do chassi.',
          },
          {
            titulo: 'Com o OK por e-mail, execute e lance no Extranet',
            descricao: 'Depois da aprovação, lance o ressarcimento na aba de Solicitação de garantia (código B0C407) anexando o E-MAIL DE AUTORIZAÇÃO + a cópia da NF do serviço. Prazo: 10 dias após a execução.',
          },
        ],
      },
      {
        titulo: 'Retorno das peças à fábrica (quando a decisão vier com "D")',
        intro:
          'Peça marcada com decisão "D" na SG tem que voltar FÍSICA pra KUHN em até 45 dias — senão a KUHN ' +
          'fatura as peças pra revenda (28 dias pra pagar). Use a fase "Devolução de peças" do card pra não perder o prazo.',
        passos: [
          {
            titulo: 'Emita a NF de retorno',
            descricao: 'CFOP 5949 (dentro do estado) / 6949 (fora). A NF deve amarrar com a nota de origem: natureza da operação, quantidades, valores, impostos e o nº da NF de origem nas observações. Retorno fiscal: posvendasregiao2@kuhn.com (São José dos Pinhais/PR, nossa região).',
          },
          {
            titulo: 'Embale e agende a coleta',
            descricao: 'A KUHN paga o frete e indica a transportadora; nós embalamos (sem risco de vazamento) e agendamos a coleta. Registre NF, transportadora e rastreio na fase "Devolução de peças" do card.',
          },
          {
            titulo: 'Peça aprovada SEM retorno (decisão só "A")',
            descricao: 'Deve ser INUTILIZADA mediante prova física: vídeo da destruição com data. Guarde o vídeo anexado ao card.',
          },
        ],
      },
    ],
    observacoes: [
      'Garantia de máquina: 1 ano a partir da Entrega Técnica (autopropelidos: 1 ano OU 1000 horas, o que vier primeiro). Peças de reposição: 3 meses da NF de venda.',
      'O Certificado de Entrega Técnica deve ser registrado no Extranet em até 3 dias úteis após a entrega — sem ele a solicitação nem é avaliada.',
      'Abertura de componentes invioláveis (blocos, bombas, motores, redutores, elétricos/eletrônicos) sem autorização prévia = perda da garantia. Foto de bancada só com autorização.',
      'Kit de revisão programada e peças genuínas KUHN são obrigatórios nas revisões — senão a máquina perde a garantia.',
    ],
  },

  tatu: {
    slug: 'tatu',
    titulo: 'Tatu Marchesan',
    resumo:
      'A Tatu NÃO ressarce mão de obra nem deslocamento — SÓ PEÇAS. Por isso a estratégia é sempre ' +
      'tentar que a ASSISTÊNCIA DA FÁBRICA execute a montagem/serviço no cliente, em vez do nosso técnico ' +
      '(gasto de M.O. que ninguém paga). A solicitação é feita no site aberto deles (Canal de Suporte ao ' +
      'Produto, sem login) e as respostas chegam por E-MAIL: um com o número da solicitação e, se aprovar, ' +
      'outro confirmando. A maioria das peças volta pra fábrica — e TODA solicitação exige a NF de retorno.',
    acesso: {
      url: 'https://assistencia.marchesan.com.br/',
      observacao: 'Formulário aberto — não precisa de login, só do captcha no fim. O acompanhamento fica em "Consulta Solicitação", no topo do site.',
    },
    documentos: [
      'Dados do cliente: nome, CPF/CNPJ, e-mail, telefone, município/UF',
      'Nº de série igual ao da PLAQUETA do implemento + nº da NF de venda',
      'Horas trabalhadas e dados do trator que puxa o implemento (marca, modelo, cavalos, ano)',
      'Fotos: plaqueta de identificação, item com a falha (e checklist, se for componente faltante) — máx. 5 arquivos de 3Mb (jpg/png/pdf/mp4), pelo menos 1 é obrigatório',
    ],
    passos: [
      {
        titulo: 'Antes de tudo: tente puxar a fábrica pro serviço',
        descricao:
          'A Tatu não paga a nossa mão de obra. Se o caso envolve montagem/reparo no cliente, negocie com o suporte deles pra que a PRÓPRIA FÁBRICA faça o serviço em campo — nós só entramos quando não der de outro jeito.',
        dica: 'Registre essa tratativa no card (observações) — é o que justifica o gasto quando o nosso técnico precisar ir.',
      },
      {
        titulo: 'Assuma a análise no portal',
        descricao: 'Abra a garantia aqui, assuma e confira as peças e o relato sincronizados da OS. O relato do Tratorilson serve de base pra Descrição do formulário.',
      },
      {
        titulo: 'Abra o Canal de Suporte da Marchesan',
        descricao: 'Acesse o site (link acima) e preencha os Dados do Proprietário com os dados do CLIENTE (nome, CPF/CNPJ, e-mail, telefone, município/UF). Em "Onde está o produto?", marque "Cliente final" — ou "Estoque de revendedor" se a máquina ainda estiver no nosso pátio.',
      },
      {
        titulo: 'Responsável pela reclamação = nós',
        descricao: 'Nos Dados do responsável pela reclamação vão os NOSSOS dados (garantista da Nova Tratores): nome, e-mail do pós-vendas, município/UF e telefone — é pra esse e-mail que a Tatu responde.',
      },
      {
        titulo: 'Dados da Solicitação',
        descricao:
          'Aba "Implemento" (ou "Peças de Reposição" pra peça comprada no balcão). Preencha o Nº de Série EXATAMENTE igual ao da plaqueta, o Nº da Nota (NF de venda), identifique o produto e as Horas Trabalhadas. Marque o(s) tipo(s) de problema (Mecânico, Hidráulico, Elétrico, Estrutural, Componente faltante, Outros).',
        dica: 'Os links "Catálogo Peças Marchesan" e "Catálogo Peças Civemasa" no próprio formulário ajudam a achar o código certo das peças.',
      },
      {
        titulo: 'Descrição + dados do trator',
        descricao:
          'Na Descrição (até 1200 caracteres) conte a falha, a provável causa e as ações tomadas — use o relato do Tratorilson e cite os códigos das peças. Depois preencha os Dados do Trator (marca, modelo, cavalos, ano) e responda "É uma Plaina?".',
      },
      {
        titulo: 'Anexos + captcha + enviar',
        descricao:
          'Anexe a foto da plaqueta, a foto do item com a falha e, se for componente faltante, a foto do checklist. Máximo 5 arquivos de 3Mb cada (jpg, jpeg, png, pdf, mp4) — pelo menos 1 é obrigatório. Resolva o captcha e clique em Enviar.',
        dica: 'Vídeo curto (mp4 até 3Mb) da falha em funcionamento ajuda muito na aprovação.',
      },
      {
        titulo: 'Anote o número e acompanhe pelo e-mail',
        descricao:
          'Depois do envio chega um E-MAIL com o número da solicitação — anote no card da garantia aqui do portal. Se aprovar, chega outro e-mail confirmando. Dá pra consultar também em "Consulta Solicitação" no site.',
      },
      {
        titulo: 'Marque o card como enviado à fábrica',
        descricao:
          'De volta ao portal, clique em "Enviar à fábrica" no card (precisa da montadora definida e do checklist completo) — ele vai pra "Em análise da fábrica". Na Tatu o envio de verdade foi o formulário do site; esse clique só registra isso no nosso fluxo — mas sem ele a tela de finalizar (anexar retorno, marcar peças aprovadas) não aparece.',
      },
      {
        titulo: 'Registre o retorno e finalize',
        descricao:
          'Com a resposta da fábrica, anexe a confirmação no card, marque as peças aprovadas e finalize. Horas e km ficam de fora — a Tatu não paga M.O./deslocamento.',
      },
      {
        titulo: 'Devolva as peças usadas (com NF sempre)',
        descricao:
          'A MAIORIA das peças precisa voltar fisicamente pra fábrica, e 100% das solicitações exigem a NOTA FISCAL DE RETORNO — mesmo quando a peça em si não volta. Use a fase "Devolução de peças" do card (ela abre sozinha ao aprovar) pra registrar NF, transportadora e comprovante sem perder o prazo.',
      },
    ],
    observacoes: [
      'Tatu NÃO ressarce mão de obra nem km — só peças. Todo serviço que a fábrica puder fazer no cliente é dinheiro que não sai do nosso bolso.',
      'O card da garantia entra automaticamente na fase "Devolução de peças" ao ser aprovado (a flag da Tatu já está ligada) — o sininho avisa quando o prazo estiver chegando.',
      'As respostas chegam por e-mail no endereço informado como responsável pela reclamação — use o e-mail do pós-vendas pra resposta cair na nossa caixa.',
    ],
  },

  ventura: {
    slug: 'ventura',
    titulo: 'Ventura',
    resumo:
      'A Ventura (quadriciclos/UTVs) recebe tudo pelo site próprio, numa solicitação só: peças + ' +
      'mão de obra. A M.O. é ressarcida EM MINUTOS (item "0000 - MÃO DE OBRA" na lista de peças) e ' +
      'eles NÃO pagam km — só o tempo trabalhado. O relatório técnico deles tem os mesmos 3 campos ' +
      'que o Tratorilson já gera (reclamação, análise da falha e reparo), então é revisar e colar.',
    acesso: {
      url: 'https://ventura-pos-vendas.github.io/Ventura-Pos-Vendas/',
      observacao:
        'Site aberto, sem login — a "Chave de Acesso" da revenda (nova573) vai DENTRO do formulário e é a mesma que abre o "Meus Casos" (Área do Dealer), onde a resposta da fábrica aparece.',
    },
    documentos: [
      'Nota fiscal — obrigatória, normalmente a NF de VENDA (PDF/JPG/PNG/DOC/DOCX)',
      'Fotos/vídeos da falha — obrigatório, MÁXIMO 2 arquivos de 10MB (JPG/PNG/vídeo)',
      'Dados do veículo: chassi, cor, modelo e horímetro atual',
      'Dados da última revisão: número, data, quilometragem, horímetro e nº da O.S. da revisão',
      'Relato técnico do Tratorilson (reclamação, diagnóstico e ação — viram os 3 campos do site)',
    ],
    passos: [
      {
        titulo: 'Assuma a análise no portal',
        descricao:
          'Abra a garantia aqui, assuma e confira as peças e horas sincronizadas da OS. Revise os textos do Tratorilson — reclamação, diagnóstico e ação são exatamente os 3 campos do Relatório Técnico da Ventura.',
      },
      {
        titulo: 'Abra o site e clique em GARANTIAS',
        descricao:
          'O site abre com "Orçamentos" pré-selecionado — clique no botão GARANTIAS antes de preencher qualquer coisa.',
      },
      {
        titulo: 'Escolha a categoria',
        descricao:
          'Selecione a que se encaixa: normalmente "Cliente Final" (máquina já entregue — é a tela mais completa, com os dados da revisão) ou "Estoque Concessionária" (ainda no nosso pátio). Há também Check List e Licitação pra casos específicos.',
      },
      {
        titulo: 'Dados da Revisão (categoria Cliente Final)',
        descricao:
          'Preencha o nome do cliente final, o número da revisão (1ª, 2ª...), a data, a quilometragem, o horímetro no momento da revisão e o número da O.S. da revisão.',
      },
      {
        titulo: 'Dados do Revendedor — Chave de Acesso nova573',
        descricao:
          'Na "Chave de Acesso" digite nova573 (o nome da revenda preenche sozinho). Complete CNPJ, endereço (rua, número, bairro, estado, cidade, CEP), telefone e o e-mail do pós-vendas.',
      },
      {
        titulo: 'Entrega, frete e dados do veículo',
        descricao:
          'Endereço de Entrega: "Enviar para o endereço de faturamento" (padrão) ou "Retirada na Fábrica". Observações de frete são opcionais. Nos Dados do Veículo: número de série (CHASSI), cor, modelo e o horímetro ATUAL do painel.',
      },
      {
        titulo: 'Relatório Técnico + anexos',
        descricao:
          'Cole os textos do Tratorilson nos 3 campos: Reclamação do Cliente, Análise da Falha e Reparo a ser Executado. Anexos Técnicos são OBRIGATÓRIOS — fotos/vídeos da falha, máximo 2 arquivos de 10MB (escolha as melhores evidências). Notas Fiscais também são obrigatórias — anexe a NF de venda.',
        dica: 'Só 2 arquivos de anexo técnico: se precisar de mais evidência, prefira 1 vídeo curto + 1 foto da falha.',
      },
      {
        titulo: 'Peças/Serviços — M.O. em MINUTOS',
        descricao:
          'Pesquise e selecione as peças pela referência/nome. A mão de obra entra como o item "0000 - MÃO DE OBRA (MINUTOS)" — lance o tempo trabalhado convertido em MINUTOS (ex.: 2h30 = 150). A Ventura NÃO paga deslocamento/km, só o tempo. Confira a lista de "Peças Utilizadas" e clique em Enviar.',
        dica: 'Converta as horas da OS pra minutos antes de lançar — é o único jeito que eles ressarcem a M.O.',
      },
      {
        titulo: 'Marque o card como enviado à fábrica',
        descricao:
          'De volta ao portal, clique em "Enviar à fábrica" no card (montadora definida e checklist completo) — ele vai pra "Em análise da fábrica". Na Ventura o envio de verdade foi o formulário do site; o clique registra isso no nosso fluxo e libera a tela de finalizar depois.',
      },
      {
        titulo: 'Acompanhe em "Meus Casos" (a resposta sai no site)',
        descricao:
          'Ao terminar o envio chega um e-mail de CONFIRMAÇÃO da solicitação. A resposta da fábrica aparece direto no site: botão MEUS CASOS → digite a chave nova573 (Área do Dealer) → aba "Garantias". Cada caso mostra o número (G18XX), o protocolo (GAR...), o chassi e o status (Em Processamento, Em orçamento, Preparação, Garantia Negada...). Anote o nº do caso/protocolo no card aqui do portal.',
        dica: 'Use a busca por caso, protocolo ou chassi — e o botão Atualizar pra ver o status mais recente.',
      },
      {
        titulo: 'Finalize e devolva as peças',
        descricao:
          'Com a decisão da fábrica, anexe a resposta no card, marque o que foi pago (peças + M.O.) e finalize. A Ventura exige a devolução das peças usadas (prova de destruição) — o card entra sozinho na fase "Devolução de peças", com prazo e alerta no sininho.',
      },
    ],
    observacoes: [
      'Mão de obra é ressarcida em MINUTOS (item 0000 da lista de peças) — km/deslocamento NÃO é pago.',
      'Anexos técnicos: máximo 2 arquivos de 10MB — escolha bem as evidências antes de enviar.',
      'O e-mail é só a confirmação do envio — o acompanhamento de verdade é no "Meus Casos" do site (chave nova573).',
      'A flag de devolução de peças da Ventura já está ligada: toda aprovada abre a pendência de devolução automaticamente.',
    ],
  },

  mahindra: {
    slug: 'mahindra',
    titulo: 'Mahindra',
    resumo:
      'A Mahindra usa a planilha SG oficial, gerada automaticamente pelo portal — as fotos ' +
      'da OS já vão dentro do arquivo. Peças, horas e km vão juntos numa solicitação só.',
    documentos: [
      'SG (planilha xlsx) gerada pelo portal com os dados e fotos da OS',
      'Relato técnico formatado pelo Tratorilson (entra na própria SG)',
      'Anexos extras quando houver (NF de peças de terceiros, recibos)',
    ],
    passos: [
      {
        titulo: 'Assuma a análise',
        descricao: 'Abra a garantia, assuma e confira peças, horas e km sincronizados da OS.',
      },
      {
        titulo: 'Complete o checklist',
        descricao: 'Preencha os campos obrigatórios do checklist da Mahindra e escolha o Tipo de Garantia (Produto em Garantia, Pré-venda...).',
      },
      {
        titulo: 'Envie à fábrica',
        descricao: 'O portal gera a SG automaticamente (numeração 2026-XXX) com os textos do Tratorilson e as fotos embutidas.',
      },
      {
        titulo: 'Revise a SG',
        descricao: 'Baixe o xlsx, revise no Excel se precisar e anexe a versão revisada — a versão mais recente é a que vai pra fábrica.',
      },
      {
        titulo: 'Envie a SG por e-mail',
        descricao: 'Clique em "Enviar SG por e-mail à fábrica". O número da garantia vai no assunto pra rastrearmos a resposta.',
      },
      {
        titulo: 'Registre o retorno e finalize',
        descricao: 'Anexe o retorno da fábrica, marque o que foi pago (peças, mão de obra, deslocamento) e finalize. O que não for pago pode virar cobrança ao cliente.',
      },
    ],
  },
};

// Fluxo genérico mostrado quando a montadora ainda não tem guia escrito.
export const GUIA_GENERICO: PassoGuia[] = [
  { titulo: 'Assuma a análise', descricao: 'Abra a garantia, assuma e confira peças, horas e km da OS.' },
  { titulo: 'Complete o checklist', descricao: 'Defina a montadora e preencha o checklist configurado pra ela.' },
  { titulo: 'Envie à fábrica', descricao: 'Envie a solicitação conforme o processo da montadora (planilha, e-mail ou manual).' },
  { titulo: 'Registre o retorno e finalize', descricao: 'Anexe o retorno da fábrica, marque o que foi pago e finalize a garantia.' },
];

export function guiaDaMontadora(nome?: string | null): GuiaMontadora | null {
  return GUIAS[normalizarNomeMontadora(nome)] || null;
}
