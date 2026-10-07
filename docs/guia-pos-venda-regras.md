# Guia do Pós-Venda — regras do portal

> Para atendentes e técnicos. Levantado direto do código em 15/09/2026.
> Onde o portal não impõe regra, está escrito **"não definido no sistema"**.

## 1. OS — Ordem de Serviço (/pos)

**Fases, na ordem do quadro** (nome exato do grupo; entre parênteses o rótulo curto do seletor do card):
1. Orçamento
2. Orçamento enviado para o cliente e aguardando (Orç. Enviado)
3. Orçamento Aprovado (Orç. Aprovado)
4. Execução
5. Execução (Realizando Diagnóstico) (Diagnóstico)
6. Execução aguardando peças (em transporte) (Aguard. Peças)
7. Relatório Atualizado (Rel. Atualizado)
8. Executada
9. Executada aguardando comercial (Aguard. Comercial)
10. Aguardando outros (Aguard. Outros)
11. Aguardando ordem Técnico (Aguard. Técnico)
12. Relatório Concluído (Rel. Concluído)
13. Enviar Omie
14. Enviado Para Omie (Enviado Omie)
15. Preenchido Garantia (Preench. Garantia)
16. Concluída
17. Cancelada

- Existe um grupo virtual "Relatório Concluído - Garantia" para OS em Relatório Concluído que têm garantia. Fase sem OS não aparece. Concluída e Cancelada abrem recolhidas.

**Como a OS muda de fase**
- Manual: pelo seletor de fase no card (não há arrastar e soltar). Precisa da ação "Mover de fase".
- Manual: marcar "Reservado" (só nas 3 fases de orçamento) pergunta o dia e leva para Orçamento Aprovado, gravando a Data Início. Desmarcar volta para Orçamento enviado.
- Manual: botão "Enviar ao Omie" no card (só na fase Enviar Omie) ou "Enviar todas" no cabeçalho leva para Enviado Para Omie.
- Manual: botão "Concluir" no card aberto, que só aparece em Enviado Para Omie, leva para Concluída.
- Manual: botão "Enviar para o Omie" dentro do card aberto grava Concluída direto após o sucesso.
- Automática, rotina `pos-auto-fase` (todo dia às 05:40): 
  - Orçamento / Orçamento enviado / Orçamento Aprovado / Aguardando ordem Técnico com Previsão de Execução já vencida → Execução.
  - Execução / Diagnóstico / Aguardando peças com Previsão de Faturamento + 1 dia já vencida → Aguardando ordem Técnico.
- Automática, ao abrir a tela (no máximo a cada 5 min): Orçamento ou Orçamento enviado com Previsão de Execução vencida → Execução; Execução com Previsão de Faturamento vencida → Aguardando ordem Técnico (abre contador de atraso do técnico); Executada aguardando comercial com Previsão de Faturamento vencida → Relatório Concluído. Se alguém reverteu na mão, o sistema não move de novo.
- Automática, pelo Tratorilson: OS em Relatório Concluído com relatório do técnico são preenchidas (horas, km, datas, projeto, descrição) e vão para Enviar Omie, ou para Preenchido Garantia se houver garantia vinculada.
- Pulos entre fases fora dessas regras: não definido no sistema (o seletor aceita qualquer fase).

**Campos obrigatórios para abrir uma OS**
- Cliente (única validação). Cliente inativo no Omie não abre OS.
- Técnico, Tipo de Atendimento, Projeto/Equipamento, Descrição, datas, horas e km: não definido no sistema. Padrões: fase inicial Orçamento, Data = hoje, Tipo = Manutenção.

**Campos obrigatórios para concluir**
- Número da Ordem Omie preenchido. Mensagem: "A OS precisa ser enviada para o Omie antes de ser concluída."
- Relatório, horas, km, data fim: não definido no sistema.
- Para cancelar: Motivo do Cancelamento obrigatório; ID do substituto obrigatório se marcar "Tem substituto?".

**O que acontece ao "Enviar ao Omie"**
- Pré-requisitos: CNPJ/CPF do cliente e Data da OS preenchidos; a OS não pode já ter Ordem Omie.
- Vai para o Omie: cliente (pelo CNPJ/CPF), técnico como vendedor, projeto, descrição do serviço, plano de revisão (se Tipo = Revisão), Hora Trabalhada (horas × valor hora), KM Deslocamento (km × valor km), uma linha por requisição vinculada com o valor cobrado do cliente, observações com Serviço Realizado, Causa e links do portal.
- Garantia (Tipo Garantia ou garantia vinculada): vai com categoria de garantia, sem gerar financeiro, e rateio no departamento de garantias.
- Volta o número da Ordem Omie, gravado na OS. PPVs vinculados são enviados como Pedido de Venda (ou Remessa se a OS for "Ordem interna").
- Pelo botão do card: OS vai para Enviado Para Omie e a despesa de alimentação é lançada. Pelo card aberto: OS vai para Concluída.
- O envio cria ordem real no Omie e é irreversível.

**NFS-e**
- O portal não emite NFS-e. Emissão automática ou manual: não definido no sistema.
- O portal só lê as notas já emitidas no Omie e vincula à OS (3 vezes por dia: 05:00, 12:00 e 17:00), para OS faturada e não cancelada, nas duas contas (Nova e Castro).

**Outras regras automáticas**
- Alimentação lançada na OS vira requisição "Alimentação" em aberto no nome do técnico; ao concluir a OS ela vai para o financeiro; ao cancelar, vai para a lixeira. Anexar a nota exige a data preenchida.
- Chassis no campo Projeto: se faltar inspeção de pré-entrega ou cheque de revisão anterior, a OS recebe pendência e avisa "OS irregular".
- Criar OS notifica os técnicos; mudar fase na mão notifica admins e técnicos; cancelar avisa o motivo.
- Dias de execução criam a agenda do técnico; mover para Diagnóstico ou Aguardando peças tira o dia de hoje da agenda.
- Contador de atraso do técnico abre em Aguardando ordem Técnico e fecha em Relatório Concluído, Concluída ou Cancelada. O card mostra "Xd atrasado — cobrar {técnico}".
- Em OS de Revisão, "Gerar PPV automaticamente" cria o PPV vinculado.
- E-mail de separação de peças (rotina `pos-separar-pecas`, 15:00): sai para OS que entrou em Orçamento Aprovado com data e peças; sexta cobre sábado, domingo e segunda; domingo não envia.

## 2. PPV — Pedido de Venda de peças (/ppv)

**Fases na ordem** (rótulo na tela; valor interno quando diferente):
1. Orçamento
2. Orçamento enviado
3. Orçamento Aprovado
4. Execução
5. Realizando Diagnóstico
6. Aguardando peças
7. Aguardando comercial
8. Aguardando outros
9. Aguardando técnico
10. Relatório Concluído
11. Enviado Omie
12. Faturado (interno: "Concluída")
13. Cancelada

**O que muda em cada fase**
- Orçamento: fase de entrada de todo pedido novo.
- Orçamento / Orçamento enviado / Orçamento Aprovado: o card mostra o checkbox "reservado/agendado". Marcar pede a data; se há OS vinculada, a OS vai para Orçamento Aprovado com a previsão de execução.
- Orçamento Aprovado (ao entrar): checa estoque reservado; estoque real ≤ 2 gera aviso aos administradores do módulo.
- Execução até Relatório Concluído: só reposicionam o card e carimbam a data de entrada. Regra própria: não definido no sistema.
- Enviado Omie: entra automaticamente ao enviar o pedido ao Omie (grava número do pedido Omie e empresa). O botão "Enviar" vira "Faturar". Itens ficam congelados. O pedido para de acompanhar a OS. Remessa nunca é faturada.
- Faturado: entra só pelo faturamento no Omie (NF-e emitida). Grava data, categoria, empresa e número da NF-e. Abate as unidades rastreadas liberadas. Pedido faturado não volta de fase (só pode ir para Cancelada). Notifica "PPV faturada (NF-e)".
- Cancelada: exige motivo; se já existe pedido no Omie, cancela lá primeiro. Reservas de peças voltam ao estoque; peças liberadas viram devolução pendente. Não aceita mais itens.

**Transições**
- Manual: arrastar o card ou trocar no seletor do card. Trocar na mão desliga o espelhamento com a OS daquele pedido.
- Automática: o PPV espelha a fase da OS vinculada (1:1), enquanto não estiver em Enviado Omie, Faturado ou Cancelada e sem troca manual.
- Não existe rotina que mova fase de PPV por tempo. Prazo máximo por fase: não definido no sistema.

**Campos obrigatórios**
- Criar: Técnico, Cliente e pelo menos 1 produto. Tipo padrão "Pedido de Venda (PPV)", motivo "Venda Balcão". Cliente inativo não cria PPV.
- Salvar: Cliente e Técnico; motivo se Cancelada; Pedido Omie se Faturado.
- Enviar ao Omie: cliente com CNPJ/CPF, ao menos 1 produto com quantidade, todos os itens da mesma empresa, sem pedido Omie anterior.
- Faturar: pedido já enviado ao Omie, não ser Remessa, não estar faturado. Categoria é opcional. Peças escaneadas sem liberação avisam mas não bloqueiam.

**Rotinas**
- `pecas-abate` (a cada 30 min): peças liberadas para OS com relatório do técnico enviado; peça usada vira aplicada, não usada ou devolvida vira devolução pendente. Sem relatório, pula.
- `carrinhos-auto-fechar` (06:30): carrinhos do catálogo abertos há mais de 7 dias são fechados. Não mexe em fase de PPV.
- Relatório semanal por e-mail (segunda 07:10) com os PPVs em aberto.

**Regras ao escanear peça**
- QR de peça já no pedido apenas reserva; código novo cria o item (1 unidade, preço do catálogo).
- Peça de outra empresa é bloqueada. Peça fora do estoque é recusada informando onde está.
- Pedido faturado ou cancelado não recebe item novo.
- Trocar cliente, CPF/CNPJ ou técnico no PPV atualiza a OS vinculada.

## 3. Garantias — SG (/garantias)

**Status na ordem** (nome na tela):
1. Solicitada — criada pelo técnico no app, ou pela varredura automática de relatórios marcados como garantia sem SG (últimos 14 dias).
2. Em análise — garantista clica em assumir. Garantia criada manualmente já nasce aqui.
3. B.O. com o técnico — garantista abre pendência para o técnico; volta para Em análise quando o técnico responde.
4. Em análise da fábrica — ação "Enviar à fábrica".
5. Informação pendente — fábrica pediu informação; ao responder volta ao status anterior.
6. Aguardando serviço — só em montadora com fluxo em duas etapas, após o retorno das peças.
7. Ressarcimento na fábrica — pedido de ressarcimento de horas/km.
8. Aprovada — finalização aprovada.
9. Rejeitada — recusa da fábrica, recusa interna do garantista antes do envio, ou fábrica recusou todas as peças.

- O quadro tem ainda a coluna virtual "Devolução de peças" (aprovadas com devolução pendente).
- Recusa interna pode ser desfeita (volta a Em análise); recusa da fábrica não. Excluir SG só em Solicitada. Uma garantia ativa por OS.

**Quem pode aprovar/recusar**
- Usuários com a ação "Finalizar (aprovar/recusar)" do módulo Garantias. A mesma ação libera retorno de peças, recusa interna, cobrança ao cliente e devolução de peças.
- "Enviar à fábrica" libera enviar, gerar SG e pedir ressarcimento. "Analisar / editar" libera assumir, montadora, checklist, preços e pendências. "Configurar montadoras" libera a aba Montadoras. "Criar garantia (manual)" libera o botão Nova garantia.

**Anexos obrigatórios**
- Criar SG (técnico): só OS e nome do técnico. Foto ou anexo: não exigido.
- Enviar à fábrica: montadora definida e checklist da montadora completo. Um campo "Arquivo / Imagem" do checklist pode ser marcado como obrigatório na configuração da montadora.
- Finalizar: arquivo de retorno da fábrica obrigatório (exceto recusa interna). Bloqueia com pendência aberta. Recusa exige motivo.
- Registrar devolução de peças: NF de remessa ou comprovante anexado.
- Resposta de pendência pelo técnico: texto ou ao menos um anexo.
- NF de venda no e-mail de solicitação: não bloqueia, só pede confirmação. RAT é opcional.

**Cobrança ao cliente quando recusada**
- Não gera PPV, OS nem lançamento financeiro. É um controle de status e valor dentro do card.
- Ao finalizar como Rejeitada, a cobrança nasce "pendente". Aprovação parcial também abre cobrança, já marcando o que a garantia não pagou.
- O garantista define o valor: horas × valor-hora, km × valor-km, peças e "outros". Padrão da empresa: R$ 193,00/hora e R$ 2,80/km, mesmo que a montadora pague outro valor. Qualquer valor pode ser sobrescrito.
- Só em garantia finalizada e com total maior que zero. Vencimento sugerido: hoje + 30 dias.
- Ciclo: cobrada → paga, ou baixada como prejuízo, ou não cobrar (cortesia). Pode reabrir.
- No Omie, garantia rejeitada segue como cobrança normal na OS.

**Devolução de peças**
- Prazo padrão: 30 dias a partir da finalização. Só em garantia aprovada com devolução pedida (checkbox pré-marcado conforme a montadora).
- Estados: não aplicável, pendente, enviada, dispensada. Ajustar o prazo rearma o alerta.
- Rotina `garantias-devolucoes` (todo dia 08:00): avisa os garantistas e administradores no sininho quando o prazo vence em até 5 dias ou já venceu ("vence em X dias", "vence HOJE", "venceu há X dias"). Repete o aviso a cada 2 dias. Não envia e-mail.
- Prazos por montadora (45 dias para peças com decisão "D", NF de retorno, prova de destruição) aparecem só como orientação no guia da tela, não são validados.

**E-mails automáticos**
- Rotina `garantias-emails` (07:30 e 12:00): lê a caixa de entrada, casa a resposta da fábrica com a SG e avisa os garantistas no sininho. Anexos recebidos ficam na garantia. A mesma rotina cria SG "Solicitada" para relatórios de garantia sem SG.
- Ao enviar à fábrica: a SG é gerada; o e-mail só sai sozinho se a montadora estiver marcada como "enviar automático" e tiver destinatários. Senão fica como rascunho.
- Solicitação por e-mail (montadora tipo e-mail): disparada pelo garantista, exige status Em análise da fábrica, destinatários cadastrados e nenhuma pendência aberta.
- Ressarcimento: e-mail com horas, km e total, quando a montadora está configurada para isso.
- Destinatários: sempre a lista de e-mails cadastrada na montadora.
- Técnico recebe notificação no app a cada mudança relevante.

**Prazos validados pelo sistema**
- Dias desde a venda ou entrega: não definido no sistema.
- Horas de uso / horímetro: não definido no sistema (só copiado do relatório).
- Prazo de garantia da montadora (1 ano, 1000 horas, 3 meses de peça): não definido no sistema. Aparece só como texto de orientação no guia.
- O que o sistema controla: prazo de devolução de peças (30 dias) e vencimento da cobrança ao cliente.

**Numeração**
- Número externo da SG: ano + sequência de 3 dígitos por montadora (ex.: 2026-014), gerado na primeira emissão da SG. Número interno GAR-####.
- Página pública por QR Code (/g/id) mostra fase, histórico e fotos, sem valores.

## 4. SAT Digital (/sat)

**Colunas do Kanban, na ordem**
1. Aberto
2. Em andamento
3. Concluído
4. Cancelados — só aparece ao clicar no botão "Cancelados (n)".

- Tipos de SAT (etiqueta no card, não coluna): Manutenção, Revisão, Entrega técnica, Orçamento.

**O que "Concluir SAT" faz**
- Marca o SAT como Concluído, gravando quem concluiu e quando.
- Se outra pessoa já concluiu ou cancelou, a ação não faz nada (o primeiro vence).
- Não cria OS, não envia e-mail, não notifica, não cria lembrete: não definido no sistema.
- O card some da tela de todos na hora (tempo real). Também dá para concluir pelo card flutuante do canto da tela.

**Regras**
- Abrir: qualquer usuário. Único campo obrigatório é o Cliente. Tipo já vem "Manutenção". Data limite e observação são opcionais.
- Iniciar (Aberto → Em andamento), Concluir e Cancelar: só usuários da categoria Pós Vendas ou administradores. Mensagem: "Apenas o Pós-Vendas pode concluir ou cancelar."
- Concluir pode ser feito direto de Aberto. Não há volta de Concluído ou Cancelado. Reabertura: não definido no sistema.
- Cancelar pede confirmação e grava quem cancelou.
- "Atrasado" (selo vermelho): data limite anterior a hoje em SAT Aberto ou Em andamento. Prazo padrão por tipo: não definido no sistema.

## 5. Controle de Revisões (/revisoes)

**Intervalos de revisão (horas)**
- 50h, 300h, 600h, 900h, 1200h, 1500h, 1800h, 2100h, 2400h, 2700h, 3000h. Primeira aos 50h, depois de 300 em 300.
- Também existe a "Pré-entrega" (inspeção). A tela /revisoes/mahindra trata só 50h, 900h e Pré-entrega (pagas pela fábrica).
- Acima de 3000h na tela: não definido no sistema. No orçamento do Tratorilson o ciclo continua de 300 em 300 repetindo os kits de 300 a 1200 (1500 usa kit da 300, 1800 da 600, 2100 da 900, 2400 da 1200...).

**Mão de obra por revisão** (regra do Tratorilson, passada pelo José)
- 50h: cortesia da fábrica (0 h).
- 300h e 600h: 2 h.
- 900h: cortesia da fábrica (0 h).
- 1200h: 6 h (regulagem de válvulas, trator fica ao menos 1 noite).
- 1500h, 1800h, 2700h: 2 h. 2100h: 2 h (usa kit da 900 mas cobra). 2400h: 6 h.
- Quadriciclo: 2 h fixas em toda revisão, sem cortesia.
- Valor/hora vem da configuração do pós-vendas (padrão R$ 193). Orçamento sempre sem deslocamento.
- Horímetro solto arredonda para baixo ao múltiplo de 300; sobe só se faltarem 50h ou menos.

**Quando o lembrete é disparado**
- Não há lembrete automático por horímetro, dias de antecedência ou revisão prevista: não definido no sistema.
- O lembrete é manual: quem tem a ação "Lembretes" escolhe o usuário, data e hora e a mensagem. A cada 10 minutos o portal verifica os lembretes vencidos e cria uma notificação interna para o usuário escolhido ("Lembrete: Enviar cheque de revisão"). Sem e-mail e sem WhatsApp.
- O e-mail que existe é o envio manual do cheque de revisão (exige revisão, horímetro, remetente, destinatário e arquivo). "Marcar como enviada" registra sem enviar.

**Como o sistema estima a próxima revisão**
- Pega a última revisão com data e horímetro, calcula a média de horas por dia (horímetro ÷ dias desde a entrega; 0,5 h/dia se não houver revisão) e projeta a data da próxima. Fica "Pendente" se a data estimada já passou.
- Para trator novo sem revisão, a oportunidade de 50h usa entrega + 50 dias quando isso for mais cedo.

## 6. Feedbacks & CRM (/feedbacks)

**Desfechos da ligação** (nome na tela) e efeito:
- ✅ Serviço agendado — registro concluído, sem próximo contato, oportunidade atendida. Pede data prevista (opcional). Não cria OS.
- 💰 Vendeu — registro concluído, sem próximo contato, oportunidade atendida.
- 🔁 Retornar depois — registro fica aberto com a data de retorno (obrigatória); oportunidade continua aberta.
- ❌ Recusou — motivo obrigatório copiado para o registro; registro concluído; oportunidade atendida.
- 📵 Não atendeu — próximo contato na data informada ou hoje + 30 dias; registro vira "sem resposta" (continua aberto se foi criado há menos de 24 h); oportunidade continua aberta.
- ☎️ Número errado — registro fica aberto, sem próximo contato; o cadastro recebe a tag de pendência cadastral.
- Humor e qualidade (1 a 5) são obrigatórios em Serviço agendado, Vendeu, Retornar depois e Recusou. Não são pedidos em Não atendeu e Número errado.

**Retorno sugerido e cliente sensível**
- Não atendeu: +30 dias. Retornar com humor 1 ou 2: +90 dias. Retornar com humor normal: +7 dias. A data pode ser editada.
- Humor baixo pré-marca o checkbox "Cliente sensível" (grava a tag na pasta se ficar marcado).
- Duas ligações seguidas com humor 1 mostram o aviso para considerar "Não contatar". A marcação é sempre manual.
- Conflito: outro atendente com ligação aberta há menos de 2 h bloqueia ("Este cliente já está em ligação com Fulano"); passadas 2 h a ligação esquecida é encerrada como "não atendeu" e a nova abre.
- Fila: uma linha por cliente, juntando oportunidades abertas e registros em aberto; "Não contatar" vai para o fim.

**Oportunidades automáticas** (rótulo na tela e regra padrão):
- Revisão de garantia vencendo — revisões 50h/300h/600h previstas nos próximos 15 dias ou atrasadas. Urgente se atrasada.
- Sem serviço há tempo — cliente com trator sem serviço nem contato há 90 dias ou mais. Urgente se sem atividade há 2 anos ou com 5 ou mais equipamentos.
- Pode comprar mais — cliente com trator sem nenhum pedido há 12 meses ou mais.
- Retorno de pós-venda — última interação entre 30 e 36 dias atrás.
- Reposição de peças — já comprou peça e último pedido há 6 meses ou mais. Urgente a partir de 12 meses.
- Fora de garantia — trator com mais de 60 meses da entrega; modelos CBU/"L" e implementos com mais de 12 meses. Recebe também quem perdeu a garantia por falta de revisão.
- Garantia em risco — cheques de revisão contados da entrega (50h/6 meses, 300h/1 ano, 600h/2 anos, 900h/3 anos, 1200h/4 anos); avisa 2 meses antes de perder. Urgente com menos de 30 dias. Pulverizadores: 36 meses.
- Cadastro incompleto — sem telefone, sem e-mail ou e-mail da loja, com atividade nos últimos 24 meses.
- O cálculo roda pelo botão "Recomputar agora" ou por agendamento externo ao repositório. Horário do agendamento: não definido no sistema.
- Segmentos RFM por cliente (Campeões, Em risco etc.): não definido no sistema. "RFM" no módulo é só o tipo de registro "Reativação / oferta".

## 7. Requisições (/requisicoes)

**Colunas do Kanban, na ordem**
1. Pedido Realizado
2. Atualizada por Técnico
3. Aguardando Fornecedor
4. Enviado Financeiro
- Lixeira é uma aba à parte, não coluna. Soltar em Enviado Financeiro grava a data de envio.

**Regra de valor alto**
- Requisição com valor de despesa acima de R$ 500,00 (R$ 500,00 exatos não bloqueia) fica bloqueada para edição dos campos.
- Mover de fase, mandar para a lixeira e imprimir continuam liberados.
- Quem não é bloqueado: usuários com papel Dev.
- Pedir permissão: botão "Pedir permissão" no card, campo "O que pretende alterar?" obrigatório. Os Devs são avisados no sininho.
- Quem aprova: papel Dev, pelo "Painel do Dev" (pílula "Dev" na barra do Kanban) com botões Aprovar e Recusar. Recusa avisa o solicitante com o motivo.
- A aprovação vale para UMA alteração. Depois volta a bloquear.

**Tipos e campos obrigatórios**
- Sempre: Título, Tipo e Setor Destino (Trator-Loja, Trator-Cliente, Oficina, Comercial). Solicitante não é validado.
- Tipos: Peças, Alimentação, Serviço de Terceiros, Almoxarifado, Ferramenta, Insumo Infra, Veicular Abastecimento, Veicular Manutenção, Trator Abastecimento, Quadri Abastecimento, Hospedagem.
- Ferramenta: "Destinação da Ferramenta" obrigatória.
- Veicular Abastecimento e Veicular Manutenção: Veículo/Placa obrigatório. Veicular Manutenção: hodômetro também.
- Veicular, Trator e Quadri Abastecimento: Litros e Tipo de Combustível obrigatórios (Trator/Quadri sugerem Diesel).
- Trator-Loja e Trator-Cliente: blocos de O.S., chassis, hodômetro, cliente e valor cobrado, nenhum obrigatório. Escolher a O.S. puxa chassis e horímetro.
- Demais tipos e setores: não definido no sistema.

**Quem pode fazer o quê** (ações do módulo): Criar requisição, Editar requisição, Mover de fase, Criar/editar fornecedor, Gerir etiquetas, Excluir / lixeira, Imprimir. Quem tem o módulo inteiro pode tudo.

**Automações**
- Abastecimento só entra nos números da Frota quando a requisição está em Enviado Financeiro.
- Veicular Manutenção abre pendência no carro ao criar e fecha sozinha ao chegar em Enviado Financeiro.
- Alimentação lançada na OS cria requisição em Pedido Realizado; vai a Enviado Financeiro quando a OS conclui; vai à lixeira se o item for removido.

## 8. Tickets (/tickets)

**Status na ordem**: Aberto → Em andamento → Aguardando terceiro → Aguardando interno → Resolvido → Fechado. Cancelado é status final à parte. Fechado e Cancelado só aparecem com "incluir encerrados".

**Fechamento automático em 7 dias**
- Conta a partir da data em que o ticket foi marcado como Resolvido. Só tickets em Resolvido (tickets do War Room ficam de fora).
- Rotina diária às 06:20.
- Comentário ou anexo não reinicia o prazo. Reabrir (contestar) limpa a data e, ao marcar Resolvido de novo, a contagem recomeça.
- Ao fechar: status Fechado, sai da fila de todos, evento na timeline "Fechado automaticamente após 7 dias sem manifestação do solicitante" e notificação a solicitante, responsável e participantes.
- Ticket encerrado não aceita comentário, anexo, transferência, edição nem vínculo.

**Quem pode**
- Marcar resolvido: responsável (ou administrador).
- Contestar/reabrir: responsável ou solicitante (botão "Contestar (reabrir)").
- Confirmar e fechar: só o solicitante. Cancelar: só o solicitante.
- Transferir: responsável, solicitante ou administrador. O anterior continua como participante.
- Visão gerencial: só administradores. Demais visões: Minha fila, Meus pedidos, Acompanhando.
