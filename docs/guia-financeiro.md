# Guia do Financeiro — como usar cada tela

> Para a equipe do Financeiro, do Pós-Vendas e do balcão de Peças. Levantado direto do código em 10/11/2026.
> Cada tela vira artigos do botão "?" (base de conhecimento). Onde o portal não impõe regra, está escrito **"não definido no sistema"**.

## Financeiro — visão geral do módulo (/financeiro)

O Financeiro acompanha as cobranças de clientes (boletos, Pix, cartão), as contas a pagar que vêm das requisições e os chamados de RH. Ao abrir "Financeiro" no menu, o portal leva você direto ao Painel da sua função: Financeiro, Peças ou Pós-Vendas. Quem não tem o módulo Financeiro vê a tela de acesso restrito.

**Abas por função**
- A faixa verde no topo mostra abas diferentes conforme a função cadastrada no seu usuário.
- Função Financeiro: Painel · Kanban · Agenda · Rastreio · Relatorio · Vencidos.
- Função Peças: Painel · Kanban · Vencidos (o Painel e o Kanban são os do balcão de Peças).
- Função Pós-Vendas e as demais funções: Painel · Kanban · Vencidos (o Painel e o Kanban são os do Pós-Vendas).
- Todos veem também a aba Recibos.
- Notas fiscais e Contas do cliente só aparecem para quem recebeu essa permissão no Admin, em qualquer função.
- Agenda aparece só para a função Financeiro e para os desenvolvedores do portal.
- Vencidos fica sempre por último.
- A aba que está aberta fica branca. As outras ficam em verde mais claro.

**O que cada aba faz**
- Painel: suas tarefas do dia, em colunas.
- Kanban: os cards de cobrança de clientes, um por fase.
- Agenda: o que entra e o que sai em cada dia da semana, com os dados do Omie.
- Rastreio: a ficha completa de um documento.
- Relatorio: o relatório das contas a pagar.
- Vencidos: as cobranças em atraso.
- Notas fiscais: as notas guardadas no portal (PDF e XML).
- Contas do cliente: os títulos a pagar e a receber de um cliente ou fornecedor, com a calculadora de dívida.
- Recibos: emitir recibos de pagamento.
- A tela Despesas saiu das abas, mas continua abrindo pelo endereço dela.

**Contador vermelho de Vencidos**
- O número vermelho na aba Vencidos conta os cards de cobrança que estão na fase Vencido.
- Também conta os que estão em "Aguardando cliente" com o vencimento já passado.
- O número se atualiza sozinho quando alguém mexe num card, sem precisar recarregar a página.

**Telas que não estão nas abas**
- Novo Faturamento, Novo Registro Financeiro e Novo Chamado de RH abrem pelo botão "Novo" do Painel.
- Configurações e Logs do Financeiro não têm aba nem botão. Só abrem pelo endereço.

## Painel (/financeiro/home-financeiro)

É a mesa de trabalho da equipe do Financeiro: o que precisa de ação agora, em quatro colunas. Abre pela aba Painel para quem tem a função Financeiro. A tela se atualiza sozinha quando alguém mexe num card.

**Colunas do painel**
- Faturamento: cobranças que esperam o Financeiro.
  - Cards em "Gerar boleto" e "Validar Pix".
  - Cards em "Aguardando vencimento" com o pagamento já anexado (selo "Pagamento realizado - conferir") ou com uma parcela vencida sem comprovante.
- Requisições: contas a pagar que chegaram das requisições. O selo OMIE fica verde quando a conta já foi lançada no Omie e azul quando ainda falta enviar.
- Cliente Sem Boleto: cobranças marcadas como "cliente sem boleto".
- Pagos para concluir: cobranças já pagas que esperam alguém concluir. A coluna mostra até 100 cards.
- O número ao lado do título conta os cards da coluna.
- Cards em "Enviar para cliente", "Aguardando cliente" (sem pendência) e "Vencido" não aparecem aqui. Para vê-los, use o Kanban.
- Os chamados de RH não aparecem como coluna. Só abrem por link direto.

**O que o card mostra**
- Cliente ou fornecedor, forma de pagamento, vencimento, número das notas e valor.
- "N NFs juntas — boleto único": o card junta várias notas do mesmo cliente num boleto só. O valor mostrado é a soma.
- "Boleto anexado": o boleto já está no card.
- Faixa "Vencido": a data passou e o pagamento não foi confirmado. O botão "Conferido" dessa faixa só mostra um aviso e não muda nada no card.
- "Parcela vencida sem comprovante": uma parcela passou do prazo sem comprovante anexado.
- Na coluna Pagos para concluir, o botão "Concluir" fecha o card ali mesmo, sem abrir a janela.

**Botões do topo**
- Lupa com "−" e "+": diminui ou aumenta o tamanho das colunas, de 50% a 150%.
- Novo (verde): escolha "Boleto" para abrir Novo Faturamento ou "Pagar" para abrir Novo Registro Financeiro.

**Janela do card**
- Clique no card para abrir a janela com todos os dados.
- Dá para editar o valor, o vencimento, o número das notas e as observações. A alteração grava quando você sai do campo.
- Anexos: notas fiscais, comprovantes (um por parcela, quando é parcelado), boletos e documentos das requisições. Cada anexo tem botões para ver, trocar ou remover.
- Requisições (contas a pagar): "Adicionar" cria uma linha para o número e o anexo de mais uma requisição.
- Requisições (contas a pagar): o bloco do Omie fica logo abaixo do nome do fornecedor. Ali você confere o checklist e clica em "Validar e enviar ao Omie".
- Cards com notas juntas mostram as notas do grupo e deixam tirar uma delas, enquanto o boleto do total ainda não foi gerado ou enviado.
- Histórico deste card: quem fez o quê e quando.
- Só administradores veem o botão de excluir. Aqui a exclusão é definitiva.

**Ações de cobrança na janela**
- Gerar boleto: anexe o arquivo em "Anexar boleto" e clique em "Lançar tarefa".
  - O card vai para "Enviar para cliente" e passa para o Pós-Vendas.
  - O portal tenta mandar o boleto ao cliente por e-mail sozinho, conforme a preferência de envio do cliente.
- Anexar um boleto direto no card que está em "Gerar boleto" também move o card para "Enviar para cliente".
- Concluído — mover para Pago: aparece para Pix e cartão, para "Validar Pix" e para "Aguardando vencimento".
  - Pix, Dinheiro, Cheque e cartões exigem o comprovante anexado.
  - Nas outras formas, quem é do Financeiro (ou administrador) pode marcar como pago sem comprovante, depois de confirmar.
  - "Cliente sem boleto" tem o botão próprio "Mover para Pago".
- Pedir para Pós-Vendas recobrar: abre um ticket para o setor cobrar o cliente.
  - Fica desligado quando não há boleto gerado, quando é Pix, cartão ou cheque, ou quando o atraso passa de 180 dias.
- Mudar card para Vencido: leva o card para Vencido com a tarefa "Cobrar cliente" no Pós-Vendas.
- Concluir processo: aparece nos cards pagos, nas requisições e nos chamados de RH.
  - Uma conta a pagar que ainda não foi lançada no Omie não conclui. Ela vai para "Aguardando envio Omie" do Pós-Vendas, que termina o envio.

**O que muda sozinho**
- Ao abrir o Painel, o portal confere as cobranças com o contas a receber do Omie e move os cards.
  - Recebido no Omie: o card vai para Pago.
  - Atrasado no Omie: o card vai para Vencido.
  - Pago há 7 dias ou mais e recebido no Omie: o card vai para Concluído.
- Pix, cartão e cheque nunca ficam em Vencido. Se estiverem lá, voltam para "Aguardando cliente".
- Card em "Gerar boleto" com a data vencida continua em "Gerar boleto".
- As contas a pagar das requisições também são conferidas com o Omie. Paga no Omie, a conta é concluída.
- Toda mudança de fase fica no histórico do card. O Pós-Vendas e os administradores recebem aviso no sino.

## Kanban (/financeiro/kanban-financeiro)

Quadro com todas as cobranças de clientes (notas de serviço e de peças), uma coluna por fase. Abre pela aba Kanban para quem tem a função Financeiro. A tela se atualiza sozinha quando alguém mexe num card.

**Busca**
- Digite o cliente, o número da nota, o vencimento, a condição de pagamento ou o número do card (#).
- Com a busca preenchida, o quadro vira uma grade de resultados, com a fase de cada card numa etiqueta colorida.
- O "x" limpa a busca e volta para o quadro.

**Colunas do quadro**
- Gerar boleto: inclui também os cards "Validar Pix".
- Enviar para cliente.
- Aguardando cliente.
- Cliente sem boleto (amarela).
- Pago: inclui os concluídos com vencimento nos últimos 60 dias, mais apagados.
- Vencido (vermelha).
- Os cards não se arrastam entre colunas. Para mudar de fase, abra o card e use os botões da janela.

**O que o card mostra**
- Cliente, forma de pagamento, vencimento (em vermelho no Vencido), notas e valor.
- Selos: "Pagamento realizado", "Boleto anexado" e "N NFs juntas — boleto único".
- Boleto parcelado: uma bolinha por parcela (verde paga, vermelha atrasada, laranja vence em até 3 dias, cinza a vencer) e a contagem "x/y pagas".
- Cartão parcelado: mostra "N x de R$".
- Relógios: há quanto tempo o card existe e há quanto tempo está na fase atual.

**Juntar cards (boleto único)**
- O botão "Juntar", no título da coluna Gerar boleto, abre a lista dos cards dessa fase.
- Só dá para juntar cards do mesmo cliente.
- Escolha qual card fica como principal. Os outros somem do quadro e passam a viver dentro dele, com o valor somado.
- Desfazer: abra o card principal e tire um card do grupo. Isso só é possível enquanto o boleto do total não foi gerado ou enviado.
- Os cards de dentro do grupo seguem a fase do card principal.

**Janela do card**
- Condição de pagamento, valor total e vencimento são editáveis. Escolher "Boleto 30 dias" volta para 1 parcela.
- Boleto parcelado: lista as parcelas, com a data e o comprovante de cada uma.
  - Aviso vermelho quando uma parcela está em atraso.
  - Aviso laranja quando uma parcela vence nos próximos 3 dias.
- Notas de serviço e de peça, comprovante, boletos e observações.
- Histórico deste card: quem alterou, o quê e quando.
- Card concluído fica travado para edição.
- Só administradores veem o botão de excluir. O card some do quadro e a sincronização não o recria.

**Botões por fase**
- Gerar boleto / Validar Pix:
  - "Anexar boleto final e processar": escolher o arquivo já move o card para "Enviar para cliente" e tenta mandar o boleto por e-mail ao cliente.
  - Pix, cartão à vista e cheque não precisam de boleto. Com o comprovante anexado, aparece "Confirmar pagamento — mover para Pago".
- Aguardando cliente:
  - Boleto parcelado com parcela atrasada: "Pedir Pós-Vendas recobrar parcela" e "Marcar como visto".
  - Todas as parcelas pagas: "Todas as parcelas pagas — mover para Pago".
  - Cartão parcelado com comprovante: "Pagamento confirmado — mover para Pago".
  - Outras formas (menos Boleto 30 dias): "Pedir para Pós-Vendas recobrar" e "Mudar card para Vencido".
  - Financeiro e administradores: "Marcar como pago (sem comprovante)", exceto Pix, Dinheiro, Cheque e cartões.
- Cliente sem boleto: "Voltar ao fluxo" (volta para Gerar boleto) ou "Mover para Pago".
- Pago: "Mover para Vencido" ou "Concluir processo".
- Vencido: "Notificar Pós-Vendas" (pede recobrança) ou "Confirmar pagamento" (conclui o card).

**Recobrança**
- Pedir recobrança cria um ticket para o setor cobrar o cliente e soma uma recobrança no card.
- Fica desligada, com o motivo ao passar o mouse, nestes casos:
  - não há boleto gerado;
  - é Pix, cartão ou cheque;
  - o atraso passa de 180 dias.
- Vencido há mais de 180 dias e não recebido ganha a tarefa "Antigo (mais de 6 meses) — sem recobrança", no setor Financeiro.

**O que muda sozinho**
- Card em "Gerar boleto" com boleto anexado (que não seja Pix nem cartão) vai sozinho para "Enviar para cliente".
- O portal confere o Omie ao abrir o quadro e move os cards. Veja a mesma regra em "O que muda sozinho" do Painel.
- Os movimentos automáticos ficam no histórico do card.
- Cada movimento manual avisa a outra equipe e os administradores pelo sino.

## Agenda (/financeiro/agenda)

Mostra, dia a dia, o que entra (contas a receber) e o que sai (contas a pagar) na semana, com os dados do Omie. Abre pela aba Agenda. Só a função Financeiro e os desenvolvedores do portal têm acesso.

**Semana e empresa**
- As setas trocam de semana. "Voltar para hoje" aparece quando você está em outra semana.
- Botões Todas · Nova · Castro escolhem a empresa.
- O "?" abre "Como ler esta tela".
- Aviso "Omie desatualizado": os dados de uma empresa não são atualizados há mais de 12 horas. Pagamentos feitos depois disso ainda aparecem como em aberto.

**Bolinhas dos dias**
- Cada bolinha é um dia da semana, com o número de contas.
- O anel verde mostra quanto do dia já foi resolvido (pago ou recebido).
- O ponto vermelho avisa que há conta atrasada naquele dia.
- Clique na bolinha, ou use as setas do teclado, para ver o dia. Ao abrir, a tela mostra hoje (ou a segunda-feira, em outra semana).

**Resumo do dia**
- Entra: total a receber no dia e quantas já foram recebidas. Clique para ver só o que entra.
- Sai: total a pagar no dia e quantas já foram pagas. Clique para ver só o que sai.
- Sobra no dia / Falta no dia: entra menos sai.
- Todos os atrasados: soma de tudo que passou do prazo, de qualquer dia. Clique para listar.

**Filtros e tabelas**
- Botões Todas · Em aberto · Atrasadas · Resolvidas, com a quantidade de cada um.
- A busca procura pelo nome do cliente ou fornecedor e pela nota.
- Duas tabelas: Entra (cliente) e Sai (fornecedor), com nota, situação e valor.
- A situação mostra "N dias de atraso", "Vence hoje", "Recebido/Pago" ou "Vence dd/mm".
- O prazo que vale é a data de previsão do Omie, quando existe.

**Janela da conta**
- Clique numa linha para abrir a conta.
- Resumo:
  - uma frase do tipo "o cliente ainda não pagou…";
  - parcela, categoria, quanto o cliente ou fornecedor tem em aberto e como costuma pagar;
  - a linha do tempo (emissão, vencimento, previsão, pagamento);
  - o próximo passo e o botão "Abrir o card", quando há card de cobrança no portal.
- Detalhes: os dados como estão no Omie. Nota, documento e boleto têm botão de copiar.
- Cobrança: só nas contas a receber. Mostra o card de cobrança do portal ligado à conta.
- Cliente / Fornecedor: tudo dele na empresa (em aberto, em atraso, últimos pagos). Clique numa conta da lista para abri-la. A seta volta para a conta anterior.
- A tela só mostra. Nada aqui grava no Omie.

## Novo Registro Financeiro (/financeiro/novo-pagar-receber)

Formulário para lançar uma conta a pagar, normalmente a nota de um fornecedor que veio das requisições. Abre pelo botão Novo → Pagar do Painel do Financeiro, ou por "Chamado Pagar" nos Painéis de Peças e Pós-Vendas. Apesar do nome, a tela só cria conta a pagar.

**Buscar nota das requisições**
- Digite o número da nota (ou o número ou título da requisição).
- A busca procura só nas requisições que já estão no Financeiro.
- Os resultados são agrupados por nota e fornecedor, com o valor somado e quantas requisições há.
- Ao escolher, o formulário preenche fornecedor, número da NF, valor e descrição sozinho. Também traz a NF anexada na requisição e tenta achar o vendedor e o projeto do Omie.
- O "x" limpa a importação.

**Importar NF-e**
- Opcional.
- O XML da nota preenche tudo, inclusive o valor.
- A foto ou PDF da DANFE (leitor de código de barras) pega número, série e CNPJ.

**Campos obrigatórios**
- Fornecedor: busca na lista de fornecedores.
- Método de pagamento: Boleto, Boleto Parcelado, Pix, Cartão de Crédito, Cartão de Débito, Dinheiro, Transferência ou Carnê ISS.
- Número da nota fiscal: não é pedido no Carnê ISS nem para prestador autônomo.
- Valor total e data de vencimento.
- Descrição ou motivo.
- Boleto Parcelado abre o bloco de parcelas: de 2 a 48 parcelas, cada uma com valor e data.

**Documentação**
- "Prestador autônomo (sem nota fiscal)": dispensa a nota e o boleto para enviar ao Omie (ex.: RPA).
- Nota fiscal principal: anexe aqui, se a nota não veio da requisição.
- Anexar requisições manualmente e anexar boletos são opcionais. Aceitam vários arquivos, e "Limpar tudo" tira os escolhidos.
- Ao salvar, o portal gera o PDF de cada requisição importada e junta o boleto e o recibo que estavam nela.

**Dados Omie (rascunho)**
- Pré-preencha empresa, categoria, conta corrente, vendedor e projeto.
- Nada vai ao Omie nesta tela. O envio é feito no Painel, depois que o checklist estiver completo.

**Salvar**
- "Salvar rascunho e abrir no Painel" cria a conta na coluna Requisições do Painel do Financeiro.
- Os administradores recebem aviso.
- Só quem tem a permissão de criar lançamento no Financeiro consegue salvar. Sem ela, o botão fica cinza.

## Novo Faturamento (/financeiro/novo-chamado-nf)

Formulário para abrir uma cobrança de cliente (o "chamado de NF"), usado pelo Pós-Vendas, pelo balcão de Peças e pelo Financeiro. Abre pelo botão Novo → Boleto do Painel do Financeiro, ou por "Chamado NF" nos Painéis de Peças e Pós-Vendas.

**Categoria de nota**
- Escolha Nota de Serviço, Nota de Peças ou Ambas.
- Para cada nota escolhida, informe o número e anexe o arquivo. Os dois são obrigatórios.

**Cliente e valor**
- Nome do cliente: digite pelo menos 2 letras e escolha na lista. O CPF ou CNPJ vem junto.
- Se o cliente já tem preferência de envio, aparece a faixa verde "Prefere receber por E-mail/WhatsApp", com o contato.
- Valor total: digite só os números. A vírgula entra sozinha.

**Condição de pagamento**
- Opções: à vista no Pix, Dinheiro, Boleto 30 dias, Boleto Parcelado, Cartão à vista, Cartão Parcelado e Cheque.
- Pix, Dinheiro, cartões e Cheque pedem o comprovante, obrigatório.
- Formas à vista e Boleto 30 dias pedem uma data de vencimento ou referência.
- Boleto Parcelado e Cartão Parcelado pedem o número de parcelas (no máximo 5) e a data de cada uma. O valor é dividido igual entre as parcelas.
- Observações são opcionais.

**Para onde o chamado vai**
- "Registrar faturamento" cria o card no Kanban do Financeiro.
- Boleto entra em "Gerar boleto".
- Pix, Dinheiro, cartões e Cheque entram em "Validar Pix", com a tarefa de validar o recebimento.
- Os administradores recebem aviso. Depois de salvar, o portal volta para o seu Painel.
- Só quem tem a permissão de abrir chamado no Financeiro consegue registrar. Sem ela, o botão fica cinza.

## Novo Chamado de RH (/financeiro/novo-chamado-rh)

Formulário para pedir algo do RH ao Financeiro, como férias ou ajuste de ponto. Abre pelo botão "Chamado RH" nos Painéis de Peças e Pós-Vendas. O Painel do Financeiro não tem esse botão.

**Campos**
- Nome do funcionário: obrigatório, digitado à mão.
- Título da solicitação: obrigatório.
- Setor: Administrativo, Financeiro, Vendas, Pós-Vendas ou Oficina.
- Descrição dos detalhes: opcional.

**Criar chamado interno**
- O chamado é criado em aberto e os administradores recebem aviso.
- Depois de salvar, o portal volta para o seu Painel.
- Só quem tem a permissão de abrir chamado no Financeiro consegue criar. Sem ela, o botão fica cinza.

**Onde o chamado aparece**
- O Painel do Financeiro não tem coluna para chamados de RH.
- Na janela, o chamado mostra título, setor, descrição, o anexo de RH e o botão "Concluir processo".
- O local onde a equipe acompanha esses chamados não está definido no sistema.

## Configurações (/financeiro/configuracoes)

Preferências pessoais de quem usa o Financeiro: perfil, som dos avisos, tema e o e-mail de onde saem os boletos. Esta tela não aparece nas abas: abre só pelo endereço, que também aceita "?tab=envio" para abrir direto o e-mail de envio.

**Perfil do usuário**
- Troque a foto (ícone da câmera), o nome e a senha. Deixe a senha em branco para não mudar.
- O e-mail aparece só para leitura.
- "Salvar alterações" grava e leva você ao Painel: o do Financeiro para quem é da função Financeiro, o do Pós-Vendas para os demais.

**Sons e alertas**
- Três sons: Alerta Clássico 1, Moderno 2 e Ativo 3.
- Clique num som para ouvir e escolher. Depois clique em salvar.

**Personalização e tema**
- Escolha Modo claro ou Modo escuro. A tela muda na hora, mas só fica gravado depois de salvar.

**E-mail de envio**
- Os boletos e cobranças que você mandar saem deste e-mail.
- Provedor: e-mail da empresa, Gmail, Outlook ou Outro (servidor manual, com porta e segurança).
- E-mail da empresa usa a senha normal da caixa. Gmail e Outlook pedem a "senha de app".
- Se a senha já está salva, deixe o campo em branco para manter.
- "Salvar e-mail de envio" testa a conta antes. Se o teste falhar, o portal pergunta se quer salvar mesmo assim.
- A senha fica guardada de forma protegida.
- Sem este e-mail, o boleto não sai sozinho. No Painel e no Kanban do Financeiro, uma janela pede para configurar na hora.

## Logs do Financeiro (/financeiro/logs)

Histórico de tudo o que os usuários fizeram no módulo Financeiro. Só administradores veem. Os demais recebem "Acesso restrito a administradores". Esta tela não aparece nas abas: abre só pelo endereço.

**Filtros**
- Busca por card, usuário ou ação.
- Usuário: escolha uma pessoa ou "Todos os usuários".
- Ação: Criou, Editou, Deletou, Moveu status ou Upload.
- Ao mudar um filtro, a lista volta para a primeira página.

**Lista de registros**
- Cada linha mostra:
  - quem fez;
  - a ação, numa etiqueta colorida (Criou, Editou, Moveu status, Upload, Enviou e-mail, Enviou ao Omie, Erro envio Omie…);
  - o tipo do registro e qual card foi;
  - os detalhes (campo, de, para, valor, fornecedor, NF).
- A hora aparece como "Agora", "N min atrás", "N h atrás" ou a data.
- No topo fica o total de registros encontrados.

**Páginas**
- 30 registros por página.
- Use "Anterior" e "Próxima" para navegar.


## Painel do Pós-Vendas (/financeiro/home-posvendas)

Mostra o que o Pós-Vendas precisa fazer hoje no Financeiro: boletos de serviço (Oficina) para mandar ou recobrar, as requisições a pagar e os clientes sem boleto. É a primeira aba ("Painel") da faixa verde para quem tem a função Pós-Vendas; abrir "Financeiro" no menu já cai aqui. Só aparecem cards do Setor Oficina: os de Peças ficam no Painel do Peças.

**Botões do topo**
- **Sincronizar Omie**: busca no Omie as ordens de serviço faturadas (com nota de serviço) e cria os cards que ainda não existem. No fim aparece um resumo com quantos cards novos foram criados, quantos já existiam e o detalhe por empresa.
  - Normalmente os cards nascem sozinhos quando a nota é faturada; o botão serve para forçar a busca.
- **Novo**: abre um menu com três opções:
  - Chamado NF (nota fiscal).
  - Chamado Pagar (conta a pagar).
  - Chamado RH (solicitação de RH).
- A tela se atualiza sozinha quando alguém mexe em um card; não precisa apertar F5.

**Aviso vermelho de contas paradas**
- Aparece no topo quando há conta a pagar em "Aguardando envio Omie" há 30 dias ou mais.
- Lista os fornecedores (repetidos aparecem como "NOME (3)"). Se forem muitos, mostra 5 e um link "ver todos".
- Serve para lembrar de conferir se existe boleto desse fornecedor para mandar ao Financeiro.

**Coluna Tarefa Faturamento**
- Mostra os cards de serviço que estão em "Enviar para cliente" e os vencidos com a tarefa de cobrar o cliente.
- Cards pagos por Pix não aparecem aqui.
- Cada card mostra: a tarefa (bolinha verde = enviar; vermelha = cobrar), o selo do setor, o número do card, o cliente, como o cliente prefere receber o boleto (Envio), a forma de pagamento, o vencimento, as notas (S = serviço, P = peça) e o valor.
- "Pagamento realizado" em verde aparece quando já há comprovante anexado.
- Botão da carteira no card: move o card para "Cliente sem boleto". O sistema pergunta antes de mover.

**Coluna Requisições**
- Mostra as contas a pagar que estão com o Financeiro ou aguardando envio para o Omie.
- Cada card mostra o método de pagamento, o fornecedor, os números das requisições, o vencimento e o valor. Contas de Carnê ISS ganham um selo próprio.
- Selo "Omie" no canto: azul = ainda não lançado no Omie; verde = já lançado (passe o mouse para ver o número do lançamento).
- Faixa "Aguardando envio Omie" com a contagem de dias parado: borda laranja até 29 dias, vermelha a partir de 30 dias.

**Coluna Cliente sem boleto**
- Cards de serviço em que o cliente não vai pagar por boleto.
- Mostra cliente, forma de pagamento, vencimento, notas e valor.
- Para tirar daqui, abra o card e use "Mover para Pago".

**Janela do card (ao clicar)**
- Topo: "Voltar ao painel", "Fechar" e, só para administradores, "Excluir" (apaga o card de vez, sem volta).
- Nome, condição/método, valor e data de vencimento: só administrador consegue alterar. Os demais apenas veem.
- Card de faturamento:
  - Números da NF de serviço e da NF de peça, e observações.
  - "Notas fiscais enviadas": anexar ou trocar NF de serviço, NF de peça e, quando a forma exige, o comprovante de pagamento.
  - "Boleto do Financeiro": abre os boletos gerados. Se ainda não houver, mostra "O financeiro ainda não gerou o boleto".
  - Pagamento parcelado: escolha da quantidade de parcelas, valor de cada uma, data e comprovante de cada parcela.
  - "Preferência de envio do boleto": cadastra se o cliente quer receber por WhatsApp ou e-mail (com os e-mails). Com e-mail, há o botão "Enviar boleto por email".
  - Lista dos e-mails já mandados e das respostas do cliente.
- Card de conta a pagar:
  - Caixa "Validar e enviar ao Omie": escolha empresa, conta corrente, categoria, tipo de documento e departamento; confira o checklist e clique em "Validar e enviar ao Omie". O botão fica travado enquanto houver pendência no checklist.
  - Quando o envio dá certo, a conta é concluída sozinha e sai do painel.
  - Depois de lançada, aparece "Lançado no Omie" e o botão "Reenviar anexos ao Omie".
  - Número da nota fiscal (não aparece em Carnê ISS), descrição/observações, requisições (número + anexo, com "+" para incluir e lixeira para remover), anexos da nota fiscal e do boleto.
- "Histórico deste card" no fim: quem alterou o quê e quando.

**Botões de ação da janela**
- **Marcar como enviado ao cliente** (cards em "Enviar para cliente"): move para "Aguardando cliente".
- **Cliente recobrado** (cards com a tarefa de cobrar): registra a recobrança e devolve o card ao Financeiro com a tarefa "Cliente Recobrado (Aguardando Financeiro)".
- **Mover para Pago** (cards em "Cliente sem boleto"): Pix, Cheque, Cartão à vista e Cartão parcelado só vão para Pago com o comprovante anexado. Sem ele, o sistema avisa e não move.

**Quem é avisado e o que fica registrado**
- Toda alteração, anexo e mudança de fase fica no histórico do card com o nome de quem fez.
- Os administradores do Financeiro recebem aviso no sino quando alguém altera, anexa, move ou exclui um card.
- Chamados de RH não têm coluna nesta tela; só abrem por link direto de notificação.

## Kanban do Pós-Vendas (/financeiro/kanban)

Quadro com todas as fases dos boletos de serviço (Setor Oficina), do "Gerar boleto" até o "Vencido". É a aba "Kanban" da faixa verde para quem tem a função Pós-Vendas. Dá para incluir também os cards de Peças com a caixa "Ver Peças".

**Busca e filtro**
- Campo de busca: procura por cliente, número da nota, vencimento, condição de pagamento ou número do card. Mostra quantos resultados achou.
- Caixa **Ver Peças**: junta os cards do Setor Peças (Balcão) aos de Oficina. A escolha fica guardada no seu navegador.
- A tela se atualiza sozinha quando algum card muda.

**Colunas do kanban**
- Gerar boleto (também os cards de Pix aguardando validação).
- Enviar para cliente.
- Aguardando cliente.
- Cliente sem boleto (cabeçalho amarelo).
- Pago.
- Vencido (cabeçalho vermelho).
- Cards concluídos ou excluídos não aparecem.

**O que cada card mostra**
- Fase, número do card, selo do setor, cliente, preferência de envio do cliente, forma de pagamento, vencimento (em vermelho quando vencido), notas e valor.
- "N NFs juntas — boleto único" quando o card reúne outras notas.
- "Pagamento realizado" quando já há comprovante.
- Boleto parcelado: uma bolinha por parcela (verde = paga, laranja = vence em até 3 dias, vermelha = atrasada, cinza = a vencer), "X/Y pagas" e aviso de parcela em atraso.
- Botões no card:
  - Seta verde (só em "Enviar para cliente"): envia o boleto pela preferência do cliente e move o card para "Aguardando cliente".
  - Seta de voltar (só em "Cliente sem boleto"): devolve o card para "Gerar boleto".
  - Carteira (em todas as fases menos "Cliente sem boleto" e "Pago"): move para "Cliente sem boleto", depois de confirmar.

**Envio rápido do boleto**
- A seta verde manda o boleto e a nota anexados por e-mail, saindo do SEU e-mail, para os endereços cadastrados do cliente.
- Antes de mandar, o sistema pode pedir confirmação se achar algo estranho nos anexos.
- Se faltar algo, abre uma janela com o passo a passo:
  - Cliente sem preferência de envio: abra o card e cadastre e-mail ou WhatsApp.
  - Seu e-mail de envio não está configurado: botão "Configurar meu e-mail" (e-mail da empresa, Gmail, Outlook ou outro; no Gmail use uma senha de app). Depois de salvar, o envio continua sozinho.
  - Cliente prefere WhatsApp: o portal não manda por WhatsApp; baixe o boleto, envie pelo WhatsApp e clique em "Marcar como enviado".
  - Sem boleto anexado: anexe o boleto no card.
  - Envio falhou: confira os e-mails do cliente e a sua configuração.

**Juntar cards num boleto único**
- Botão **Juntar** no cabeçalho da coluna "Gerar boleto".
- Escolha os cards do MESMO cliente; o card principal fica com todas as notas, o valor somado e um boleto só.
- Na janela do card principal aparece o bloco "NFs agrupadas" com o botão para tirar um card do grupo (ele volta ao kanban com o valor original).
- Depois que o boleto com o total foi gerado ou enviado, o grupo fica travado: não dá para tirar cards. Card com grupo não pode ser excluído antes de desfazer o grupo.

**Janela do card**
- Nome, condição, valor total, vencimento (Boleto 30 dias), parcelas, números das notas e observações: editáveis só por administrador ou por quem recebeu a permissão "Editar cards do kanban".
- Parcelado: quantidade de parcelas, valor unitário, data e comprovante de cada parcela.
- Notas fiscais: anexar NF de serviço, NF de peça e comprovante.
- Boleto do Financeiro: abre os boletos; sem boleto, mostra "O financeiro ainda não gerou o boleto".
- Preferência de envio do boleto, e-mails já enviados e respostas do cliente.
- "Ação requerida" em "Enviar para cliente": botão **Marcar como enviado ao cliente**.
- "Comprovante de pagamento" (em "Aguardando cliente" e nas formas que exigem comprovante): ao anexar, o card fica com a tarefa "Pagamento Realizado" e os administradores do Financeiro são avisados.
- **Mover para Pago** (em "Cliente sem boleto"): Pix, Cheque e Cartão exigem comprovante anexado.
- "Histórico deste card" mostra quem fez o quê e quando.
- **Excluir** (só administrador): o card some do quadro e a sincronização com o Omie não o cria de novo.

**O que muda sozinho**
- Ao abrir o kanban (no máximo uma vez por minuto) e pelo robô do sistema, cada card é conferido com o Omie:
  - Recebido no Omie: vai para Pago, de qualquer fase.
  - Em "Aguardando cliente" e vencido: se o Omie mostra atrasado, ou se venceu sem comprovante, vai para Vencido com a tarefa "Cobrar Cliente (Vencido)". Boleto 30 dias vencido sem título no Omie vai para Pago.
  - Pix, cartão e cheque não vencem: se estiverem em Vencido, voltam para "Aguardando cliente".
  - Parcelado em Vencido que o Omie não dá mais como atrasado volta para "Aguardando cliente".
  - "Gerar boleto" vencido continua em "Gerar boleto".
  - Em Pago há 7 dias ou mais e recebido no Omie: vai para Concluído e sai do quadro.
  - Vencido há mais de 180 dias: fica em Vencido com a tarefa de "antigo, sem recobrança" no Financeiro.
- Toda mudança automática fica no histórico do card.

## Painel do Peças (/financeiro/home-pecas)

Mostra o que o balcão de Peças precisa fazer no Financeiro: boletos de pedidos de peças para mandar ou recobrar e os clientes sem boleto. É a primeira aba ("Painel") da faixa verde para quem tem a função Peças; abrir "Financeiro" no menu já cai aqui. Só aparecem cards do Setor Peças, e nunca cards que tenham nota de serviço.

**Diferenças para o Painel do Pós-Vendas**
- Não tem a coluna Requisições (contas a pagar).
- O "Sincronizar Omie" busca pedidos de venda de peças (categoria Revenda de Peças Balcão), não ordens de serviço.
- Card com nota de serviço não aparece aqui, mesmo que também tenha nota de peça.

**Botões do topo**
- **Sincronizar Omie**: busca no Omie os pedidos de venda de peças faturados e cria os cards que ainda não existem. No fim mostra quantos foram criados, quantos já existiam e quantos candidatos foram achados.
  - Normalmente os cards nascem sozinhos quando o pedido é faturado; o botão força a busca.
- **Novo**: menu com Chamado NF, Chamado Pagar e Chamado RH.
- A tela se atualiza sozinha quando alguém mexe em um card.

**Aviso vermelho de contas paradas**
- Aparece quando há conta a pagar em "Aguardando envio Omie" há 30 dias ou mais, com a lista dos fornecedores.
- Mesmo sem a coluna de Requisições, o aviso continua aparecendo aqui.

**Coluna Tarefa Faturamento**
- Cards de peças em "Enviar para cliente" e os vencidos com a tarefa de cobrar. Pix não aparece.
- Cada card mostra tarefa (bolinha verde = enviar; vermelha = cobrar), selo "Setor Peças", número, cliente, preferência de envio, forma de pagamento, vencimento, notas e valor.
- "Pagamento realizado" aparece quando já há comprovante.
- Botão da carteira: move para "Cliente sem boleto", depois de confirmar.

**Coluna Cliente sem boleto**
- Cards de peças em que o cliente não vai pagar por boleto.
- Para tirar daqui, abra o card e use "Mover para Pago".

**Janela do card (ao clicar)**
- "Voltar ao painel", "Fechar" e, só para administradores, "Excluir" (apaga de vez).
- Nome, condição, valor e vencimento: só administrador altera.
- Números das notas, observações, anexos das notas e do comprovante.
- "Boleto do Financeiro": abre os boletos ou avisa que o financeiro ainda não gerou.
- Parcelado: quantidade, valor de cada parcela, data e comprovante de cada uma.
- "Preferência de envio do boleto" (WhatsApp ou e-mail) e lista dos e-mails enviados e respostas.
- "Histórico deste card" no fim.

**Botões de ação da janela**
- **Marcar como enviado ao cliente**: move para "Aguardando cliente".
- **Cliente recobrado**: registra a recobrança e devolve ao Financeiro.
- **Mover para Pago** (em "Cliente sem boleto"): Pix, Cheque e Cartão exigem comprovante anexado.
- Os administradores do Financeiro recebem aviso no sino a cada alteração, anexo, movimento ou exclusão.

## Kanban do Peças (/financeiro/kanban-pecas)

Quadro com todas as fases dos boletos de pedidos de peças (Setor Peças), do "Gerar boleto" até o "Vencido". É a aba "Kanban" da faixa verde para quem tem a função Peças.

**Diferenças para o Kanban do Pós-Vendas**
- Mostra só cards do Setor Peças e nunca cards com nota de serviço. Não existe a caixa "Ver Peças".
- A busca não mostra o contador de resultados.
- **Excluir** apaga o card de vez (o do Pós-Vendas só tira do quadro).

**Busca**
- Procura por cliente, número da nota, vencimento, condição de pagamento ou número do card.
- A tela se atualiza sozinha quando algum card muda.

**Colunas do kanban**
- Gerar boleto (também Pix aguardando validação), Enviar para cliente, Aguardando cliente, Cliente sem boleto, Pago e Vencido.
- Cards concluídos ou excluídos não aparecem.

**O que cada card mostra**
- Fase, número, selo "Setor Peças", cliente, preferência de envio, forma de pagamento, vencimento, notas e valor.
- "Boleto único" quando reúne outras notas; "Pagamento realizado" quando há comprovante.
- Boleto parcelado: bolinhas por parcela (verde paga, laranja vence em até 3 dias, vermelha atrasada, cinza a vencer) e aviso de parcela em atraso.
- Botões: seta verde (enviar boleto, em "Enviar para cliente"), seta de voltar (em "Cliente sem boleto", volta para "Gerar boleto") e carteira (move para "Cliente sem boleto", com confirmação).

**Envio rápido e boleto único**
- A seta verde manda boleto e nota por e-mail, saindo do seu e-mail, para os endereços do cliente, e move para "Aguardando cliente".
- Se faltar preferência do cliente, configuração do seu e-mail ou anexo, ou se o cliente prefere WhatsApp, abre uma janela com o passo a passo (inclui "Configurar meu e-mail" e "Marcar como enviado").
- Botão **Juntar** na coluna "Gerar boleto": junta cards do mesmo cliente num boleto único. Depois do boleto gerado ou enviado, o grupo fica travado.

**Janela do card**
- Condição, valor, vencimento, parcelas, notas e observações: só administrador ou quem tem a permissão "Editar cards do kanban" altera.
- Anexos das notas e do comprovante, boletos do Financeiro, preferência de envio, e-mails enviados e histórico.
- **Marcar como enviado ao cliente**, **Anexar comprovante** (avisa os administradores do Financeiro) e **Mover para Pago** (Pix, Cheque e Cartão exigem comprovante).
- **Excluir** (só administrador): apaga o card definitivamente, sem volta.

**O que muda sozinho**
- Ao abrir o quadro e pelo robô do sistema, cada card é conferido com o Omie: recebido vai para Pago; atrasado no Omie ou vencido sem comprovante vai para Vencido com a tarefa "Cobrar Cliente (Vencido)".
- Pix, cartão e cheque não vencem; "Gerar boleto" vencido continua em "Gerar boleto".
- Em Pago há 7 dias ou mais e recebido no Omie: vai para Concluído e sai do quadro.
- Vencido há mais de 180 dias fica em Vencido como "antigo, sem recobrança".
- Toda mudança automática fica no histórico do card.

## Despesas (/financeiro/historico-pagar)

Resumo das contas a pagar já concluídas: quanto se gastou, com quem e em quê, mês a mês. Esta tela não aparece mais nas abas da faixa verde; abre só pelo endereço. Vale para qualquer pessoa com acesso ao Financeiro.

**Busca e período**
- Campo "Buscar por fornecedor, nota, valor, #123, chave ou boleto…": filtra a lista na hora e diz quantas despesas achou no período.
- Se você colar uma chave de NF-e, a linha digitável de um boleto ou um número de requisição, aparece um atalho para ver a ficha completa do documento no Rastreio.
- Botões de período: 3, 6, 12 (padrão) ou 24 meses. A conta é feita pela data de vencimento.
- Botão **Alterações (N)**: lista as mudanças de categoria feitas por esta tela, com quem e quando.

**Filtros ativos**
- Clicar num mês do gráfico, numa categoria, num fornecedor ou no cartão "Fora do Omie" cria uma etiqueta de filtro acima dos números.
- Clique na etiqueta para tirar o filtro. "Limpar filtros" aparece quando nada é encontrado.

**Cartões do resumo**
- Total do período (por vencimento).
- Média mensal.
- Mês mais caro.
- Quantidade de despesas.
- Fora do Omie: quantas despesas e quanto ainda não foram lançadas no Omie. Clique para ver só elas.

**Gráficos**
- "Gasto por mês": clique numa barra para filtrar aquele mês; clique de novo para tirar.
- "Maiores gastos por categoria" e "Maiores gastos por fornecedor": clique numa barra para filtrar.
- Abaixo do gráfico de categoria aparece quantas despesas estão sem categoria.

**Lista mês a mês**
- Cada mês é um bloco que abre e fecha (o mês atual vem aberto e marcado "Mês atual"), dividido por semana e por dia.
- Cada linha mostra categoria, fornecedor, parcelas pagas, situação no Omie e valor.
- Selo do Omie: tique discreto = lançado; âmbar = ainda não lançado; vermelho = falha no envio.
- A seta da linha abre os detalhes: número da despesa, vencimento, quem lançou, empresa, número do documento no Omie (com "Copiar nº" e link para o financeiro do Omie), situação de cada parcela (Paga, A vencer, Atrasada, Cancelada) e os anexos.

**Classificar ou alterar categoria**
- Despesa sem categoria mostra "Classificar"; as outras, "Alterar categoria".
- A mudança corrige só o relatório do portal. Nada é enviado ao Omie.
- Toda mudança fica em "Alterações". Quem pode mudar: não definido no sistema além do acesso à tela.

## Histórico de Recebimentos (/financeiro/historico-receber)

Lista os recebimentos concluídos, com o valor recebido e os documentos. Esta tela não aparece nas abas da faixa verde; abre só pelo endereço.

**Busca**
- Campo "Pesquisar cliente ou ID": filtra pelo nome do cliente ou pelo número do registro.

**Tabela**
- Colunas: ID, Cliente, Valor recebido, Vencimento e Documentos.
- Em Documentos: ícone para abrir a nota fiscal, ícone para abrir o boleto (quando existem) e um tique verde de concluído.
- Sem registros, aparece "Nenhum registro encontrado no histórico."

**O que a tela não faz**
- Não tem filtro de data, ordenação, edição nem exportação.
- Mostra só registros já concluídos, do mais novo para o mais antigo.

## Histórico RH (/financeiro/historico-rh)

Lista os chamados de RH já concluídos. Esta tela não aparece nas abas da faixa verde; abre só pelo endereço.

**Busca**
- Campo "Pesquisar funcionário ou título": filtra pelo nome do funcionário ou pelo título da solicitação.

**Cartões dos chamados**
- Cada cartão tem o selo "Concluído", o número, o funcionário, o setor, o título da solicitação e a data de abertura.
- Os mais recentes aparecem primeiro.
- Sem chamados, aparece "Nenhum chamado de RH concluído foi encontrado."

**Botão Ver resumo**
- O botão aparece em cada cartão, mas hoje não faz nada ao ser clicado.

## Relatório NF (/financeiro/dashboard)

Painel com os números dos chamados de nota fiscal (boletos de clientes): quantos estão em cada fase, quanto foi faturado e a lista do que está em aberto. Esta tela não aparece nas abas da faixa verde; abre só pelo endereço.

**Cartões do topo**
- Total de processos: todos os chamados, menos os excluídos. Cards juntados num boleto único contam uma vez só.
- Em aberto: tudo que ainda não está Concluído (inclui os que estão em Pago).
- Em atraso: os que estão em Vencido.
- Confirmados / pagos: Pago + Concluído.
- Total faturado: soma do valor dos que estão em Pago ou Concluído.

**Funil de status**
- Barras com a quantidade e a porcentagem em Gerar boleto, Enviar ao cliente, Aguardando vencimento, Pago, Vencido e Concluído.
- A fase "Cliente sem boleto" não tem barra no funil.

**Filtros e zoom**
- Pesquisar: por tarefa, setor, forma de pagamento ou número.
- Status, Vencimento de e Vencimento até.
- "Limpar" aparece quando há filtro e mostra quantos registros foram encontrados.
- Botões de lupa aumentam ou diminuem o tamanho da tabela (de 50% a 150%).

**Tabela de processos**
- Colunas: Processo/Tarefa, Setor, Forma de pagamento, Vencimento, Status e Valor, com o total no rodapé.
- A tabela deixa de fora os que estão em Pago. Por isso escolher "Pago" no filtro de Status não traz nada.
- Ordem: Vencidos primeiro, depois Gerar boleto, Enviar ao cliente, Aguardando e Concluído.

**Botão Imprimir**
- Fica na faixa verde, ao lado das abas.
- Imprime só a tabela (com os filtros aplicados), com data e hora de geração e o total. Cartões, funil e filtros não saem na impressão.


## Rastreio (/financeiro/rastreio)

Tela para achar tudo o que existe sobre um documento a partir de um número: conta a pagar, requisições, boletos e parcelas do Omie, notas de entrada e de saída, faturamento, pasta do cliente e os anexos, tudo numa ficha só. A aba "Rastreio" aparece na barra verde para quem tem a função Financeiro; também se chega aqui pelos links de número de nota da tela de Despesas. Para usar é preciso ter o módulo Financeiro completo ou a permissão "Rastreio de notas (busca nota/boleto/requisição)".

**Campo de busca e botão Rastrear**
- Digite no campo "Rastrear documento" e clique em RASTREAR (ou aperte Enter).
- Aceita: número da nota fiscal (com ou sem zeros à esquerda, com ou sem ponto), chave da NF-e de 44 dígitos, número da requisição com # na frente (ex.: #123), número do boleto ou a linha digitável, ou o nome do fornecedor/cliente.
- Precisa de pelo menos 2 caracteres. Se for texto (nome), pelo menos 3 letras.
- O número da nota é o caminho mais direto: a busca por nome mostra só os documentos daquela pessoa ou empresa, sem a ficha completa.
- A busca fica no endereço da página: dá para copiar o link e mandar para alguém abrir a mesma ficha.
- O botão "Voltar" no topo retorna para a tela anterior (normalmente Despesas, com o mesmo filtro que estava aberto).

**Avisos e resultado da busca**
- Quando a busca acha mais de um documento, aparece "N documentos encontrados — o mais provável primeiro".
- Faixas amarelas avisam situações como: boleto casado por valor + vencimento (é uma suposição, confira), resultado muito amplo (refine o termo), lista que pode estar cortada, ou chave que também aparece no recebimento de NF-e do estoque.
- Se nada for encontrado, tente o número da nota sem zeros à esquerda, o #número da requisição ou o nome do fornecedor.
- Os documentos são juntados automaticamente pela chave da NF-e, pelo número da nota + CNPJ, ou pelo número da nota + fornecedor. Quando isso não basta, use o vínculo manual (ver abaixo).

**Cabeçalho da ficha**
- Mostra "NF número" (ou o documento principal), o nome da outra parte e o valor de referência.
- Selos: "chave NF-e ✓" (casada pela chave), "vínculo manual" (alguém ligou à mão), "CANCELADA" (nota de saída cancelada) e "substituída" (nota trocada na pasta do cliente).
- Cada bloco abaixo (Conta a pagar, Requisições, Boletos / parcelas (Omie), NF de entrada (compras), NF de saída (faturamento Omie), Faturamento (a receber), Pasta do cliente) só aparece se tiver algo, mostra a quantidade entre parênteses e abre/fecha ao clicar no título.

**O que cada bloco mostra**
- Conta a pagar: número, fornecedor, valor, vencimento, forma de pagamento, situação ("No financeiro", "Aguardando Omie" ou "Concluída"), selo "Omie ✓" quando já foi lançada no Omie, quem criou e as parcelas com data e valor.
- Requisições: número (clique abre a requisição em outra aba), título, fornecedor, nota, valor, situação e OS, quando houver.
- Boletos / parcelas (Omie): se é A PAGAR ou A RECEBER, número do lançamento, número do boleto, parcela, valor, vencimento, situação no Omie e a empresa.
- NF de entrada (compras): número/série, emitente, valor, data de emissão e empresa.
- NF de saída: número/série, tipo, cliente, valor, data e o link "DANFE", que abre a nota da Omie em outra aba (se o navegador bloquear, libere pop-ups).
- Faturamento (a receber): card do Kanban do Financeiro com cliente, notas de serviço e de peça, valor, forma de pagamento, vencimento e situação.
- Pasta do cliente: OS ou pedido de venda, empresa, número da nota, selo "anexo manual" e "substituída por NF X".

**Anexos da ficha**
- Junta os anexos de todos os documentos da ficha, com miniatura; clique para ver em tamanho maior.
- Botão "Imprimir tudo (N)": abre uma nova janela com cada anexo numa folha e chama a impressão. XML não entra na impressão.
- Botão "Baixar tudo (.zip)": baixa todos os anexos num arquivo compactado. Se algum não puder ser baixado, a tela avisa quais ficaram de fora.
- XML da NF-e aparece como cartão "baixar XML".
- Arquivo guardado no Drive antigo aparece com borda tracejada: não dá para baixar por aqui, abra pelo documento de origem indicado.

**Vincular e desvincular documentos**
- Use quando a ficha não juntou sozinha um documento que é do mesmo caso (fornecedor escrito diferente, nota sem número etc.).
- Clique em "Vincular" no cabeçalho da ficha, busque o outro documento (nº da nota, #requisição, boleto ou fornecedor) e clique nele. Documentos que já estão na ficha não aparecem na lista.
- O vínculo fica guardado e aparece no bloco "Vínculos manuais", com quem fez. O botão "desvincular" desfaz.
- Vincular e desvincular ficam registrados no histórico de atividades do portal.
- Quem pode vincular: as mesmas pessoas que podem usar o Rastreio.

## Vencidos (/financeiro/vencidos)

Lista dos cards do Kanban do Financeiro (contas a receber dos clientes) que já venceram e não foram pagos. A aba "Vencidos" aparece na barra verde para todas as funções (Financeiro, Pós-Vendas e Peças), sempre como a última aba, com um número vermelho de quantidade.

**Quais cards entram na lista**
- Entra todo card que está na fase Vencido.
- Também entra o card que está aguardando o cliente com a data de vencimento já passada, menos:
  - Pix, cartão e cheque (a data é só combinada, não vence);
  - "Boleto 30 dias" (quando vence, o sistema passa sozinho para Pago);
  - parcelado em que a parcela vencida já tem comprovante anexado.
- No parcelado, conta a primeira parcela vencida sem comprovante.
- Card que foi agrupado dentro de outro não aparece: quem é cobrado é o card principal.
- O número vermelho na aba usa uma conta mais simples (só a data) e pode ser maior que a quantidade da lista.

**Topo e busca**
- O título "Cards Vencidos" mostra a quantidade e o total em reais.
- Campo "Buscar cliente, NF ou ID...": procura por nome do cliente, número do card, nota de serviço, nota de peça, forma de pagamento ou CNPJ.

**Lista de cards**
- Ordem: do vencimento mais antigo para o mais novo.
- Cada linha mostra o cliente, o número do card, a nota de serviço (NFS) e a de peça (NFP), a forma de pagamento, a data de vencimento em vermelho, o valor, quantas recobranças já foram feitas e um selo com os dias de atraso (mais forte acima de 7 dias e acima de 30 dias).
- A lista se atualiza sozinha quando alguém mexe num card do Kanban.
- Clique na linha para abrir a janela de detalhes.

**Janela de detalhes**
- Mostra o cliente, o CNPJ, quantos dias está em atraso, a data de vencimento, o valor, a forma de pagamento e o número de parcelas.
- Links para abrir as notas fiscais (serviço e peça), os boletos e os comprovantes anexados no card.
- Mostra as observações do card e quantas recobranças já foram enviadas.

**Botão Pedir Recobrança**
- Cria um ticket no bloco "Cobranças — Pós-Vendas" ou "Cobranças — Peças" (conforme o setor do card) para alguém do setor cobrar o cliente.
- O ticket vai para a pessoa do setor com menos cobranças abertas no bloco, com prazo de 2 dias úteis.
- O card fica em Vencido com a tarefa "Cobrar Cliente (Recobrança)" e o contador de recobranças sobe 1.
- Se já existe um ticket aberto para aquele card, nada é duplicado: a tela avisa o número do ticket que já existe.
- Os administradores do Financeiro recebem uma notificação.
- O botão fica bloqueado, com o motivo escrito, quando: o card não tem boleto anexado ("Sem boleto gerado"), é Pix/cartão/cheque, ou está vencido há mais de 180 dias.
- Quem pode: quem tem o módulo Financeiro, quem tem a função Financeiro, e administradores.
- Resolver o ticket não muda o card: quem cobrou anexa o comprovante no card.

**Botão Marcar como Pago**
- Passa o card para a fase Pago, com a tarefa "Pagamento Confirmado".
- Para Pix, Cheque, Cartão à vista e Cartão Parcelado, só deixa marcar se o comprovante estiver anexado no card.
- Registra no histórico e avisa o outro setor (o Financeiro avisa o Pós-Vendas e vice-versa) e os administradores do Financeiro.
- Restrição de quem pode marcar: não definido no sistema além do acesso à tela.

**O que muda sozinho**
- O sistema confere o contas a receber do Omie (sincronizado algumas vezes por dia) e move os cards sem ninguém clicar:
  - recebido no Omie: vai para Pago;
  - atrasado no Omie: vai para Vencido com a tarefa "Cobrar Cliente (Vencido)";
  - Pix/cartão/cheque nunca ficam em Vencido (voltam para aguardando o cliente);
  - parcelado cujas parcelas vencidas já foram pagas no Omie volta para aguardando o cliente;
  - vencido há mais de 180 dias fica com a tarefa "Antigo (mais de 6 meses) — sem recobrança", no setor Financeiro;
  - card em "Gerar boleto" não vai para Vencidos, mesmo com a data passada (sem boleto não há o que cobrar).
- Essa conferência roda pelo agendador do portal e também quando alguém abre um Kanban do Financeiro.

## Vencidos — versão nova em teste (/financeiro/vencidos/teste)

Versão nova da tela de Vencidos, ainda em teste para comparação com a atual. Não tem aba na barra verde: abre pelo endereço. Uma faixa azul no topo avisa que a versão atual continua na aba Vencidos. Usa as mesmas regras de quais cards entram (ver tela Vencidos).

**Quadros do topo**
- "Em atraso": total em reais e quantidade de cards.
- "Para cobrar do cliente": cards com boleto que o Omie ainda não deu como pago (cobrança do Pós-Vendas/Peças).
- "Venceu sem boleto": cards sem boleto gerado no portal; é tarefa do Financeiro gerar o boleto antes de cobrar.
- "Já pago no Omie": o banco já deu baixa; só falta dar como pago aqui.
- Clicar num quadro filtra a lista; clicar de novo volta para todos.

**Filtros**
- Busca por cliente, nota, número do card ou CNPJ.
- Setor: Todos, Oficina ou Peças (com a quantidade de cada).
- Faixa de atraso: 1 a 15 dias, 16 a 30, 31 a 60, mais de 60. Clicar de novo desliga a faixa.
- Botão "Card a card" / "Por cliente": junta os cards do mesmo cliente (pelo CNPJ ou nome), com o total e o maior atraso; os clientes com mais dinheiro aparecem primeiro.
- A busca e o setor mudam os números do topo; a faixa e o quadro escolhido mudam só a lista.

**Lista**
- Ordem: do maior atraso para o menor.
- Cada linha mostra cliente, número do card, notas, setor (Oficina ou Peças), selo "Sem boleto", quantas vezes já foi recobrado, forma de pagamento, data em que venceu, dias de atraso, a situação no Omie ("Pago no Omie", "Atrasado no Omie", "Em aberto no Omie" ou "Não achado no Omie") e o valor.
- A situação no Omie vem do contas a receber sincronizado, que atualiza a cada poucas horas.
- Botão da linha: "Dar como pago" quando o Omie já recebeu; senão "Recobrar".

**Gaveta do card**
- Abre ao clicar na linha, pelo lado direito.
- Mostra valor, tarefa atual e recobranças.
- Bloco "No Omie": cada parcela casada com a nota do card, com vencimento, situação (Recebido, Atrasado ou A vencer), data do pagamento e valor.
- Bloco "Documentos": links do boleto e das notas de serviço e de peças.
- Botões "Pedir recobrança", "Dar como pago" e "Abrir no kanban" (abre o card no Kanban do setor certo).

**Regras dos botões**
- Recobrar segue as mesmas regras da tela Vencidos: cria o ticket no bloco de cobranças do setor e fica bloqueado sem boleto, para Pix/cartão/cheque e com mais de 180 dias de atraso.
- "Dar como pago" pede confirmação. Se o Omie já deu o título como recebido, não exige comprovante; senão, Pix, Cheque e Cartão exigem o comprovante anexado no card.

## Relatório de contas a pagar (/financeiro/relatorio-pagar)

Relatório das despesas cadastradas no portal (as contas a pagar criadas pelo Financeiro e pelas requisições), com números do topo, maiores fornecedores, filtros e impressão. A aba "Relatorio" aparece na barra verde só para quem tem a função Financeiro; também é achada pela busca de telas do portal.

**Números do topo**
- Total de Registros: todas as contas a pagar, de qualquer situação.
- Pendentes: quantidade e valor das que não estão concluídas.
- Em Atraso: pendentes com vencimento antes de hoje.
- Vence Este Mês: valor das pendentes que vencem no mês atual.
- Total Pago: valor das contas concluídas.
- Esses números e o quadro de fornecedores consideram tudo, sem os filtros.

**Top fornecedores**
- Os 8 fornecedores com maior valor somado, com a quantidade de registros de cada.
- Conta pendentes e concluídas juntas.

**Filtros e zoom**
- Pesquisar: fornecedor, motivo, número da nota, forma de pagamento ou número da conta.
- Status: Todos, Pendente ou Concluído.
- Vencimento de / até: período pela data de vencimento.
- Botão "Limpar" aparece quando há filtro e mostra quantos registros sobraram.
- Botões de lupa diminuem ou aumentam o tamanho da tabela (de 50% a 150%).

**Tabela**
- Colunas: Fornecedor, Motivo, NF, Método, Vencimento, Status (Pendente ou Concluído) e Valor.
- Ordem: pendentes primeiro, depois concluídas; dentro de cada grupo, por vencimento.
- O rodapé mostra o total de registros e o valor somado da lista filtrada.
- A tela só lê: nada é alterado por aqui.

**Botão Imprimir**
- Fica na barra verde, à direita das abas.
- Imprime só a tabela, com o título "Relatório contas a pagar — Nova Tratores", a data e hora em que foi gerado e o total. Respeita os filtros escolhidos.
- Números do topo, fornecedores e filtros não saem na folha.

## Contas recorrentes (/financeiro/recorrentes)

Mostra as contas fixas do mês (aluguel, salário, energia, cartões de frota etc.) que costumam ser lançadas no Omie e ainda não foram lançadas neste mês. Não tem aba na barra verde: abre pelo endereço. Só podem abrir quem tem a função Financeiro, os desenvolvedores e o Mariano, responsável pelos avisos.

**Como o sistema acha uma conta recorrente**
- Lê as contas a pagar do Omie das duas empresas (Nova Tratores e Castro Peças).
- Conta recorrente = mesmo fornecedor, vencendo perto do mesmo dia, em pelo menos 5 dos 6 meses anteriores. Um fornecedor pode ter mais de uma conta (dias diferentes).
- Compras, frete, juros, multas, tarifas, viagens, férias, 13º e outras despesas eventuais ficam de fora. Contas canceladas no Omie não contam.
- Cada conta tem o seu prazo: dia em que costuma vencer + quantos dias ela costuma demorar para entrar no Omie + 7 dias de folga. Só depois disso é tratada como faltando.
- São avaliados o mês atual e os 2 anteriores.
- Há um "Como ler esta tela" no topo que explica isso; abra clicando nele.

**Quadros do topo**
- Faltando lançar: passou do prazo e não tem conta no mês (com o valor costumeiro somado).
- Dentro do prazo: ainda não tem conta, mas ainda é normal; mostra o dia em que vai avisar.
- Lançadas ou resolvidas: já lançadas, lançadas no mês vizinho ou resolvidas à mão.
- Contas fixas acompanhadas: quantos fornecedores e quantos meses estão sendo olhados.
- Clicar num quadro filtra a lista. A tela abre em "Faltando lançar".

**Filtros**
- Empresa: Todas, Nova Tratores ou Castro Peças.
- Mês: Todos os meses ou um mês específico (o número no botão é quantas estão faltando naquele mês).
- Busca por fornecedor ou categoria.

**Lista de contas**
- Cada linha mostra o fornecedor, a empresa, a categoria e quem costuma lançar.
- Bolinhas: os 6 meses anteriores e o mês do aviso (verde = teve conta). Ao lado, em quantos dos 6 meses teve conta.
- Valor costumeiro, dia em que vence, quantas contas costumam vir no mês e, se o valor varia muito, a variação.
- Situação: "Faltando lançar" (com quantos dias passou do prazo), "Dentro do prazo" (avisa em tal dia), "Lançada", "Lançada no mês vizinho" (veio com outro vencimento, não avisa) ou "Resolvida à mão".
- Quando vieram só algumas das contas costumeiras do mês, aparece "veio X de Y".
- Clique na linha para abrir a gaveta com o prazo deste mês (vencimento, quanto costuma demorar, folga, data do aviso, valor, quem lança) e o histórico de contas e valores dos últimos meses.

**Botões Já lancei, Não vai ter e Não é recorrente**
- Aparecem nas contas "Faltando lançar" e "Dentro do prazo".
- Já lancei: marca a conta daquele mês como resolvida.
- Não vai ter: aquele mês não terá essa conta; marca como resolvida.
- Não é recorrente: tira a conta da tela em todos os meses, de vez.
- As duas primeiras ficam como "Resolvida à mão", com quem marcou e quando; o botão "Desfazer" volta a conta para a situação anterior.
- Se a tela mostrar um aviso amarelo de que os botões estão desligados, eles ficam travados até o ajuste no banco ser feito pelo time do sistema.

**Aviso no sino e dados**
- Em "Faltando lançar" aparece uma prévia de como o aviso vai aparecer no sino do responsável. Por enquanto é só prévia: nenhum aviso é enviado.
- No rodapé: o responsável, quantos títulos do Omie foram lidos e a data da última sincronização das contas a pagar.
- Os dados vêm da cópia das contas a pagar do Omie que o portal atualiza algumas vezes por dia; conta lançada agora no Omie pode demorar a aparecer como lançada.


## Notas fiscais (/financeiro/notas)

Arquivo das notas fiscais da Nova e da Castro guardadas no próprio portal, em PDF e XML, para abrir mesmo quando a Omie está fora do ar. Aparece para quem tem a permissão "Notas fiscais (cache PDF + XML)", na aba "Notas fiscais" da barra do Financeiro. Também abre a partir de outras telas já com a busca preenchida.

**Saída, Entrada e Todas**
- As abas no alto escolhem o tipo de nota: Saída, Entrada ou Todas.
- A tela abre na aba Saída, com o período do mês atual (do dia 1 até hoje).
- A aba Entrada só aparece para quem tem permissão de Recebimentos (do Estoque ou dos Ajustes) ou a permissão "Notas fiscais — ver também as de entrada (só consulta)". Quem não tem, não vê nota de entrada em nenhum lugar da tela.
- Quem vê as entradas tem também o link "Notas de entrada: itens e contas a pagar", que leva à tela de notas de entrada do Estoque (itens e custos).
- O seletor "Conta" no canto direito escolhe Nova, Castro ou Todas. Em "Todas", cada linha mostra de qual empresa é a nota.

**Indicadores do topo (cobertura)**
- Notas: quantas notas o portal conhece (na empresa escolhida).
- Com PDF e Com XML: quanto por cento delas já tem o arquivo guardado no portal.
- Completas: notas com PDF e XML guardados.
- Na fila: notas que ainda não foram guardadas e serão buscadas na Omie.
- Sem documento: notas que a Omie não entregou depois de várias tentativas (número em vermelho quando há alguma).
- Parando o mouse sobre os indicadores aparece quando foi a última rodada automática.

**Filtros e busca**
- Período (emissão): botões prontos "30 dias", "90 dias", "1 ano" e "Tudo", ou as duas datas à mão.
- Buscar: escreva e escolha onde procurar no seletor ao lado:
  - em: Tudo: nº da nota, pedido, OS, chave, cliente, CNPJ ou chassi. Um número curto procura ao mesmo tempo nº da nota, nº do pedido e nº da OS. O CNPJ/CPF só entra a partir de 6 dígitos.
  - em: Nº da nota: o número ou a chave de 44 dígitos.
  - em: Pedido de venda: o nº do pedido da Omie.
  - em: OS: o nº da OS. Traz a nota de serviço da OS e também as notas de peças ligadas a ela.
  - em: Cliente: nome, CPF ou CNPJ.
  - em: Máquina: chassi inteiro, final do chassi ou modelo.
- Zeros à esquerda não importam: buscar 0123 ou 123 dá no mesmo.
- No modo Tudo, cada nota encontrada mostra a etiqueta "bateu em: Nota / Pedido / OS / Cliente / Máquina".
- Se não achar nada com período marcado, a tela avisa para clicar em "Tudo" no período e procurar em todas.

**Tipo da nota**
- NFS-e: nota de serviço (OS).
- NF-e Peças: nota de produto só com peças.
- NF-e Máquinas: nota de produto só com máquinas e implementos.
- NF-e Peças e Máquinas: as duas coisas na mesma nota.
- NF-e outras: nota de produto sem itens de venda no portal (remessa, devolução, pedido que não está na Pasta Clientes).
- Entrada: nota de compra.
- A separação entre peças e máquinas vem dos itens do pedido de venda da nota: família "Peças" conta como peça; trator, implemento, carreta e as demais famílias contam como máquina.

**Filtros do cabeçalho da tabela**
- Embaixo do título de cada coluna há um campo de filtro: Tipo (marque um ou vários), Nº ou chave, Emissão (de / até), Cliente ou fornecedor (nome ou CPF/CNPJ), Pedido ou OS, Máquina (chassi ou modelo), Valor (de / até) e Documento (guardada, falta PDF ou XML, sem documento).
- Os filtros se somam: a lista mostra só as notas que passam em todos.
- O campo filtrado fica com a borda azul. "Limpar filtros (N)" tira todos de uma vez.
- Os filtros ficam no endereço da página: dá para copiar o link e mandar para outra pessoa já filtrado.

**Total dos filtros**
- O quadro verde acima da lista mostra a soma do valor de TODAS as notas do filtro (não só da página aberta) e quantas são.
- Notas canceladas ficam fora do total; o quadro diz quantas são e quanto somam.
- Ao lado vem o total de cada tipo (NFS-e, NF-e Peças, NF-e Máquinas…). Clique num deles para filtrar só aquele tipo; clique de novo para tirar.

**Exportar relatórios**
- O botão verde "Exportar relatórios" só aparece para quem tem a permissão "Notas fiscais — exportar relatórios". O acesso total ao Financeiro não dá essa permissão: ela é marcada à parte no Admin.
- Ele abre uma janela com os relatórios prontos: Por mês, Por tipo, Por máquina, Por cliente / fornecedor, Por empresa e mês e Lista completa.
- Escolha o formato: Excel, PDF ou CSV.
- O relatório usa exatamente os filtros que estão na tela; a janela mostra quais são antes de gerar.
- Cada exportação fica registrada com o nome de quem gerou, o relatório, o formato e os filtros (aparece em Atividades como "Exportou relatório de notas").
- O relatório vai até 30 mil notas; acima disso a tela pede para diminuir o período ou filtrar mais.

**Lista de notas**
- Colunas: Tipo, Nº / Série, Emissão, Cliente / Fornecedor, Pedido / OS, Máquina, Valor, Documento e as ações.
- Clique no título de uma coluna para ordenar de A a Z; clique de novo para Z a A. Sem escolher, a lista vem da nota mais nova para a mais velha.
- Nota cancelada aparece apagada, com "Cancelada" embaixo do número.
- Embaixo do número aparece o começo e o fim da chave da nota (parando o mouse, a chave inteira).
- Pedido / OS: o número é um link que abre o pedido ou a OS na Pasta Clientes, em outra aba.
- Máquina: clique para ver todas as notas daquela máquina (busca pelo chassi).
- A lista mostra 50 notas por página, com "← Anterior" e "Próxima →" no fim.

**Abrir o PDF e baixar o XML**
- "Ver PDF" abre a nota dentro do portal, com opção de imprimir e baixar.
- Clicar no número da nota também abre um menu com "Ver PDF" e "Baixar XML".
- O XML só aparece para quem tem a permissão "Notas fiscais — baixar XML".
- Se o arquivo ainda não estiver guardado, o portal busca na Omie na hora e já guarda para a próxima vez.
- "Guardar agora" aparece nas notas que ainda não estão completas: busca na Omie só aquela nota. A tela diz o resultado (ex.: "Guardada: PDF ok · XML ok", ou que a Omie ainda não concluiu a nota).

**Selo da coluna Documento**
- Guardada (PDF + XML): a nota está completa no portal; abre mesmo com a Omie fora.
- Só PDF guardado / Só XML guardado: falta um dos dois arquivos.
- Na fila (só na Omie): ainda não foi guardada; o portal vai buscar sozinho.
- Aguardando a Omie concluir: a nota ainda não está concluída na Omie (ex.: recebimento pendente); o portal tenta de novo depois de uns dias.
- Sem documento na Omie: a Omie não entregou o arquivo depois de 8 tentativas.
- Parando o mouse sobre o selo aparece o último erro, quando houver.

**De onde vêm as notas e quando a Omie cai**
- A lista de notas vem das cópias da Omie que o portal já mantém (notas de entrada e de saída).
- Os arquivos (PDF e XML) são buscados sozinhos, em lotes, da nota mais nova para a mais velha. Hoje a rotina roda a cada 10 minutos.
- Quando a Omie bloqueia as consultas ou está fora, a rotina para e tenta de novo depois, sem perder a vez da nota.
- Com a Omie fora aparece a faixa amarela "Omie indisponível: mostrando só o que já está guardado". O que já está guardado continua abrindo normalmente; o resto fica na fila.

**Quem pode o quê**
- Ver a tela e os PDFs: permissão "Notas fiscais (cache PDF + XML)".
- Baixar XML: permissão "Notas fiscais — baixar XML".
- Exportar relatórios: permissão "Notas fiscais — exportar relatórios" (cada exportação fica registrada).
- Ver notas de entrada: permissão de Recebimentos ou "Notas fiscais — ver também as de entrada (só consulta)".
- Botão "Indexar e guardar agora": só administradores. Ele atualiza a lista de notas e guarda um lote de 30 na hora.

## Contas do cliente (/financeiro/contas-cliente)

Mostra tudo o que um cliente ou fornecedor tem em aberto com a Nova e com a Castro (o que ele nos deve e o que nós devemos a ele) e calcula a dívida atualizada com multa e juros. Aparece para quem tem a permissão "Contas do cliente/fornecedor + calculadora de dívida", na aba "Contas do cliente" da barra do Financeiro. É só consulta e simulação: nada é gravado na Omie.

**Busca da pessoa e período**
- Digite pelo menos 3 letras do nome (com ou sem acento) ou números do CPF/CNPJ.
- A busca procura no cadastro de clientes da Omie e junta a Nova e a Castro pelo mesmo CPF/CNPJ. Na Omie, o mesmo cadastro serve de cliente e de fornecedor.
- Cada resultado mostra o documento, a cidade e as etiquetas NOVA e/ou CASTRO (em qual empresa a pessoa tem cadastro).
- Mostra no máximo 25 resultados; se não aparecer quem procura, escreva mais do nome.
- Escolhida a pessoa, o endereço da tela guarda quem é: dá para mandar o link para um colega abrir a mesma pessoa.
- O cabeçalho da pessoa mostra nome, fantasia, documento, cidade, telefone e e-mail.
- Etiquetas "NOVA · código" e "CASTRO · código" mostram o código do cadastro na Omie; "sem cadastro na CASTRO" (ou NOVA) quando não há.
- "Em aberto" (padrão): só títulos ainda não pagos.
- "Todos (período)": títulos pagos e abertos com vencimento entre as duas datas. Abre com um ano para trás até 30 dias à frente.

**Cartões do resumo**
- Ele nos deve (a receber): soma do que está em aberto a receber, com a parte da NOVA e da CASTRO embaixo.
- Atrasado a receber: soma do que já venceu e quantos títulos são.
- Nós devemos (a pagar): soma do que está em aberto a pagar.
- Saldo (receber − pagar): verde "A favor da empresa" ou vermelho "A favor dele". No modo "Todos (período)" mostra também quanto já foi recebido e pago.
- Clicar num cartão filtra a lista embaixo (a receber, só atrasados ou a pagar).

**Lista de títulos**
- Botões "A receber" e "A pagar", com a quantidade de cada um.
- Filtro de empresa (Todas, NOVA, CASTRO) e a caixinha "só atrasados".
- Colunas: Empresa, Título (nº do documento ou da nota, e a parcela), Emissão, Vencimento, Atraso, Valor, Em aberto, Atualizado (só em A receber), Situação e Categoria.
- Embaixo do vencimento: "prev." quando a data de previsão na Omie é diferente, e "pago" com a data, quando já foi pago.
- Atualizado: o valor em aberto já com multa e juros até a data-base da calculadora (fica vermelho quando há encargo).
- Situação: A VENCER (azul), VENCE HOJE (laranja), ATRASADO (vermelho), CANCELADO (cinza); pago/recebido em verde.
- Parando o mouse sobre a linha aparece a observação do título.
- Clique no título de qualquer coluna para ordenar (▲ ou ▼).

**Selo "espelho da Omie atualizado há X"**
- Os títulos vêm de uma cópia da Omie que o portal atualiza algumas vezes por dia, não da Omie ao vivo.
- O selo mostra há quanto tempo foi a última atualização: cinza quando recente, laranja a partir de 4 horas, vermelho a partir de 9 horas.
- Parando o mouse aparece o horário de cada empresa.
- Um título baixado agora na Omie pode continuar aparecendo como aberto até a próxima atualização.
- Esta tela não consulta a Omie: mesmo com a Omie fora ela abre, com os dados da última cópia.

**Escolher títulos para a calculadora**
- Só entram títulos A RECEBER e EM ABERTO.
- Uma empresa por vez: depois de marcar um título da NOVA, os da CASTRO ficam apagados (e vice-versa). Não dá para juntar as duas no mesmo demonstrativo.
- Marque pela caixinha ou clicando na linha.
- "Marcar atrasados da NOVA" / "Marcar atrasados da CASTRO" marca de uma vez todos os vencidos daquela empresa (substitui o que estava marcado).
- Na calculadora, o "X" ao lado de um título tira ele da conta; "Limpar" desmarca tudo.

**Calculadora da dívida: como a conta é feita**
- Data-base: o dia até quando os juros são contados (padrão: hoje).
- Multa: cobrada uma vez só, sobre o valor em aberto, se o título estiver atrasado.
- Juros: por dia de atraso, com o mês contado como 30 dias. Simples (padrão) ou compostos.
- Carência: atraso dentro da carência não cobra nada. Passou da carência, cobra desde o vencimento (os dias da carência entram na conta).
- Desconto nos encargos: tira uma porcentagem só da multa e dos juros; nunca do valor original.
- Exemplo com a regra padrão (multa 2 % e juros 1 % ao mês, simples): título de R$ 1.000,00 com 45 dias de atraso.
  - Multa: R$ 20,00.
  - Juros: 1.000 × 1 % × 45 ÷ 30 = R$ 15,00.
  - Total atualizado: R$ 1.035,00.
  - Com desconto de 50 % nos encargos: os R$ 35,00 de encargo caem para R$ 17,50, e o total vira R$ 1.017,50.
  - Com carência de 5 dias e só 3 dias de atraso, o total fica R$ 1.000,00.
- Os números da regra começam com a regra da empresa escolhida. Dá para mexer só nesta simulação; "voltar à regra da NOVA" (ou CASTRO) desfaz.
- Embaixo aparece a composição: Valor em aberto, Multa, Juros, Desconto (quando houver) e Total atualizado.

**Simular parcelamento**
- Marque "Simular parcelamento" e escolha o nº de parcelas (de 1 a 60) e o 1º vencimento (padrão: daqui a 30 dias). As demais vencem no mesmo dia dos meses seguintes.
- "Parcelas iguais, sem juros no parcelamento": divide o total; a sobra dos centavos vai na última. Ex.: R$ 1.035,00 em 3 = 3 de R$ 345,00.
- "Com juros de X % a.m. (tabela Price)": parcelas iguais com os juros da regra. Ex.: R$ 1.035,00 em 3 com 1 % ao mês = 3 de R$ 351,92.
- A lista mostra cada parcela e a soma.

**Demonstrativo e resumo para o cliente**
- "Demonstrativo (PDF)": abre um PDF com a empresa, o cliente, a regra aplicada, cada título (vencimento, dias, valor, multa, juros, atualizado), os totais e as parcelas, quando houver. Diz que os valores valem até a data-base e que não substitui boleto nem nota.
- "Copiar resumo": copia um texto curto para colar no WhatsApp (total, multa, juros, desconto e parcelas).
- Os dois só funcionam com pelo menos um título marcado e ficam registrados no histórico de atividades do portal.
- Nada vai para a Omie: o boleto ou a renegociação continuam sendo feitos como hoje.

**Regra de juros da empresa**
- A engrenagem ao lado de "Calculadora da dívida" abre a regra de cada empresa (NOVA e CASTRO): multa, juros ao mês, carência, desconto nos encargos e tipo de juros.
- Só aparece para administradores ou quem tem a permissão "Contas do cliente — editar a regra de juros da empresa".
- Mostra quem alterou por último e quando. Toda alteração fica registrada no histórico de atividades.
- Sem regra cadastrada, vale o padrão: multa de 2 % e juros de 1 % ao mês, simples, sem carência e sem desconto.

## Recibos (/financeiro/recibos)

Emite recibos de pagamento numerados, com o valor por extenso escrito sozinho e um QR que confere se o recibo é verdadeiro. Pode lançar o recibo na Omie como conta já paga ou já recebida. Aparece na aba "Recibos" da barra do Financeiro para administradores e para quem tem acesso ao Financeiro, ao POS ou ao PPV.

**Topo da tela**
- "Novo recibo": formulário para emitir.
- "Emitidos (N)": lista dos recibos já emitidos.
- "Recebido no mês" e "Pago no mês": somas dos recibos não cancelados com data de pagamento no mês atual. A conta usa só os recibos que estão na lista (os 200 mais recentes, ou os que batem com a busca).
- "Como usar": abre a explicação rápida da tela.

**Recebemos ou Pagamos**
- "Recebemos de alguém": alguém pagou a empresa (ex.: cliente pagou a OS no balcão). O recibo pode sair com a sua assinatura salva no portal.
- "Pagamos a alguém": a empresa pagou alguém (frete, diária, serviço avulso). Sai com a linha para a pessoa assinar à mão.
- Em "Recebemos", a caixinha "Sair com a minha assinatura salva" vem marcada. Desmarcada, ou se você não tem assinatura salva, sai só a linha para assinar.

**Campos do recibo**
- Empresa (Nova Tratores ou Castro Peças) e Data do pagamento.
- Quem pagou / Quem recebeu: nome completo ou razão social (mínimo 3 letras).
- CPF ou CNPJ: opcional quando não vai lançar na Omie; se preenchido, precisa ter 11 ou 14 números.
- Valor (R$): logo embaixo aparece o valor por extenso.
- Referente a: o que foi pago (mínimo 3 letras). Ex.: "pagamento da OS 0846 — revisão de 300 h do trator 6075".
- Forma de pagamento: PIX, Dinheiro, Cartão de débito, Cartão de crédito, Transferência bancária, Cheque ou Boleto.
- Cidade (padrão "Piraju - SP") e Observação (opcional, sai no recibo).

**Prévia e modelo de impressão**
- Ao lado do formulário aparece a prévia do recibo em PDF, atualizada enquanto você digita.
- A prévia só aparece depois de preencher nome, valor e "Referente a".
- Modelos de impressão:
  - Duas vias na folha: A4 com a via do cliente em cima e a via da empresa embaixo, para recortar.
  - Folha inteira: uma via, A4, letras maiores.
  - Meia folha (A5): compacto, bom para o balcão.
- O modelo escolhido fica guardado neste computador.

**Lançar na Omie**
- A caixinha "Lançar no Omie" vem marcada. Ao emitir, o recibo vira na Omie uma conta a pagar já paga (Pagamos) ou uma conta a receber já recebida (Recebemos).
- Para lançar é obrigatório: CPF ou CNPJ, a Categoria (despesa para Pagamos, receita para Recebemos) e a Conta corrente. As listas vêm da Omie na hora.
- Quem não tem cadastro na Omie é cadastrado sozinho (como fornecedor ou cliente).
- A última categoria e conta usadas ficam guardadas neste computador, por empresa e tipo.
- O lançamento não fica ligado a nenhuma OS ou pedido.
- Se a Omie estiver fora, as listas não carregam e o botão de emitir fica travado. Para emitir mesmo assim, desmarque "Lançar no Omie".

**Emitir e imprimir**
- O botão "Emitir e imprimir" só libera com os campos obrigatórios preenchidos.
- Ao emitir, o recibo ganha um número de 6 dígitos e o PDF abre em outra aba para imprimir.
- O formulário limpa, mas mantém empresa, tipo, forma de pagamento e as escolhas da Omie.
- Se o recibo foi emitido mas a Omie recusou o lançamento, a tela avisa o motivo. O recibo continua valendo; use "Tentar de novo" em Emitidos depois de corrigir.

**Lista de emitidos**
- Busca por nome, número, CPF/CNPJ ou "Referente a". Mostra os 200 recibos mais recentes.
- Colunas: Nº, Data, Tipo, Pessoa (com a empresa quando é a Castro), Referente, Forma, Valor, Omie, Emitido por.
- Coluna Omie: "Paga" ou "Recebida" quando lançou; "Não lançou" com o botão "Tentar de novo" quando a Omie recusou (parando o mouse aparece o motivo); traço quando não era para lançar.
- O botão de download abre o PDF do recibo no modelo escolhido.

**Cancelar um recibo**
- Recibo errado não se apaga: clique no botão vermelho de cancelar e diga o motivo (obrigatório).
- O recibo cancelado fica apagado na lista, com o valor riscado e "Cancelado: motivo" no lugar de quem emitiu. O PDF passa a sair com a marca CANCELADO.
- Se o recibo já foi lançado na Omie, o cancelamento NÃO desfaz o lançamento: estorne a baixa e exclua a conta direto na Omie.
- Qualquer pessoa com acesso à tela pode cancelar; não há outra regra no sistema.

**Conferir pelo QR**
- Cada via do recibo tem um QR e o endereço para conferência.
- Quem ler o QR (sem precisar de login) vê "Recibo verdadeiro", "Recibo cancelado" ou "Recibo não encontrado", com número, valor, quem pagou ou recebeu, documento parcial, data e forma de pagamento.
- Se algo do papel estiver diferente do que aparece no celular, o recibo foi alterado.


