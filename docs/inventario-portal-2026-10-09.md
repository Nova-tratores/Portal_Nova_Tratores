# Inventário do Portal Nova Tratores (09/10/2026)

Levantamento feito lendo o código, sem abrir as telas. Ordem = grupos do menu lateral.
Marque [x] no que conferiu. Problemas encontrados ficam no fim.

---

# 1. GERAL

## Dashboard (/dashboard)
- [ ] Cartões de todos os sistemas por grupo; 3 formas: Estilo Omie, Grade, Lista
- [ ] Favoritos com estrela (arrastar para reordenar) e pastas pessoais
- [ ] Vitrine que passa de sistema em sistema
- [ ] Busca "Buscar tela ou sistema" (acha telas e guias internas)
- [ ] Botão "Sincronizar com Omie" (Clientes, Projetos, Produtos)
- [ ] Versão celular (lançador de apps); cartão externo "Back Nova"
- [ ] Aviso "Aguardando liberação" para quem não tem módulos

## Central de Trabalho (/tickets/quadros)
Guias: Quadros · Cronograma · Visão gerencial (admin) · Pendências. Botões Novo ticket / Nova tarefa.
- [ ] **Quadros**: Pra organizar · Meus blocos · Pedidos que fiz
- [ ] **Bloco**: colunas Aberto / Em andamento / Aguardando / Resolvido; filtros; integrantes
- [ ] **Ticket**: começar, aguardar, resolver, confirmar, contestar, cancelar; conversa com anexo; prazo ou contínuo; participantes; trocar bloco; planejar no cronograma; tarefas do ticket; dados da compra
- [ ] **Visão gerencial**: tickets abertos do mais parado; lista ou kanban
- [ ] **Cronograma** (/cronograma): Fila, Gantt, Calendário, Kanban; arrastar muda prazo
- [ ] **Cronograma de projeto** (/cronograma/[id]): Gantt, caminho crítico, datas da OS
- [ ] **Pendências** (/tarefas): Minhas, Enviadas, Órfãs (admin); "levar para um ticket"
- [ ] **Solicitações de Compras** (/tickets/compras): kanban por etapa, dias parado
- [ ] **Config. de Compras** (/tickets/compras/config): responsável por etapa, limites de valor/estoque
- [ ] Painel do Dia: "Fulano criou ticket para você" (confirmar/propor data/recusar), "Seu dia" às 7h30

## Base de conhecimento (/conhecimento)
- [ ] Guias: Artigos · Para aprovar · Retornos dos leitores
- [ ] Artigo com "Isso ajudou?" (Sim/Não/Desatualizado)
- [ ] Editor em blocos, rascunho com IA, só o responsável publica
- [ ] "O que mudou" (/conhecimento/novidades): rascunho a cada versão nova
- [ ] Botão "?" no topo de cada tela puxa o artigo da tela

---

# 2. SERVIÇOS
Faixa azul: Pós-Vendas · Lousa · Garantias · Revisões · Clientes · Janela Mecânico · SAT · Mapa Técnico · Fotos Técnicos

## Pós-Vendas / OS (/pos)
Modos: Cards · Relação · Dashboard (+ versão celular)
- [ ] Quadro por fases; mudar fase no card; filtro por técnico; atualiza a cada 60 s
- [ ] "Reservar data" (vai para Orçamento Aprovado)
- [ ] Fase "Enviar Omie": uma OS ou todas
- [ ] Fase "Cobrando Cliente": cobrança por WhatsApp via Tratorilson, link de assinatura
- [ ] Aviso de OS atrasada; selo de garantia; selo "Pendência Mahindra"
- [ ] Relação: filtro por coluna, PDF, CSV
- [ ] Dashboard: valor/quantidade por mês, técnico, fase, tipo, cliente
- [ ] Menu: Lembretes por cliente · Gerar Relatório por técnico · Configurações (valor hora/km)
- [ ] **Janela da OS – abas**: Serviços · Produtos (PPV) · Requisições & Alimentação · Relatório Técnico · Garantia · Observações · Histórico
- [ ] Deslocamento calculado pela rota (km, tempo)
- [ ] Busca de chassi e "Revisão Pronta"; importar kit; criar PPV pela OS
- [ ] Alimentação do técnico com nota (vira requisição)
- [ ] Fotos do técnico (horímetro, chassi, falhas, peças)
- [ ] Cheque de revisão: gerar, PDF, link WhatsApp
- [ ] Assinatura do cliente: link/WhatsApp, prova com mapa
- [ ] Imprimir OS (com/sem peças) e PPV; PDFs oficiais do Omie
- [ ] QR Code da OS; registrar ocorrência; e-mails de peças
- [ ] Descontos, trocar cliente, "serviço interno", cancelar com motivo

## Garantias (/garantias)
Abas: Pipeline · Finalizadas · Relatório · Buscar · Página do cliente (QR) · Montadoras
- [ ] Contadores: solicitadas, em análise, na fábrica, devolver peças
- [ ] Nova garantia a partir de uma OS
- [ ] Checklist por montadora; fotos da OS e do garantista
- [ ] Horas/km técnico × garantista
- [ ] Solicitação (planilha Mahindra ou e-mail com RAT e NF)
- [ ] Relato pronto escrito pelo Tratorilson
- [ ] Conversa com a fábrica (e-mails), informação pendente
- [ ] Devolver ao técnico; aprovar/recusar; ressarcimento
- [ ] Retorno das peças: NF, transportadora, rastreio, prazo, prateleira
- [ ] Cobrança do cliente; cancelar por duplicação; reabrir recusa
- [ ] Robôs: lê e-mails da fábrica, alerta prazo de devolução, acha solicitação perdida
- [ ] Página pública do QR (/g/[id]) para o cliente acompanhar

## Controle de Revisões (/revisoes)
- [ ] Busca por chassi/cliente/motor; cartões Em dia / Pendente
- [ ] Painel "Cheques atrasados" + "Verificar agora"
- [ ] Novo Trator
- [ ] **Janela do trator – abas**: Timeline · Inspeção · Emails · Enviar (Mahindra) · Observações · Lembretes
- [ ] **Revisões Mahindra** (/revisoes/mahindra): revisões 50h/900h, Excel para a fábrica
- [ ] Páginas públicas: cheque (/cheque/[token]) e assinatura (/assinar/[token])

## Janela Mecânico (/mecanicos)
- [ ] Cartão por mecânico: OS, horas, km, valor, pendências; seletor de mês
- [ ] Resumo da oficina: receita, despesa, saldo, ranking
- [ ] **Ficha – abas**: Serviços · Relatório (GPS) · Requisições · Alertas · Ocorrências
- [ ] Vincular veículo do técnico na Rota Exata; GPS ao vivo

## SAT Digital (/sat)
- [ ] Quadro Aberto / Em andamento / Concluído
- [ ] Tipos: Manutenção, Revisão, Entrega técnica, Orçamento
- [ ] Selo ATRASADO; lembrete flutuante para o Pós-Vendas

## Mapeamento Técnico (/mapa-geral)
- [ ] Camadas: clientes, máquinas, OS, PV, oportunidades, vendedores, regiões, GPS, paradas
- [ ] Replay animado das rotas do mês; mapa de calor
- [ ] Filtros (com trator, nunca visitado, cidade); editar regiões; importar KMZ
- [ ] Relatório mensal dos técnicos; geocodificar / "Sincronizar Tudo"

## Fotos Técnicos (/fotos-tecnicos)
- [ ] Fotos por OS e por categoria, assinaturas; só consulta

## Lousa Virtual (/lousa)
- [ ] Agenda semanal por técnico (manhã/tarde/dia)
- [ ] Tipos: Serviço, Faltou, Feriado, Oficina, Saída antecipada
- [ ] Mostra se o cliente tem OS ou PPV; quem recebe aviso de peças

## Clientes (/clientes) — fica em Serviços no menu
Guias: Clientes (ranking) · Por Máquina
- [ ] **Pasta do cliente – abas**: Resumo · Donos · Serviços · Peças Avulsas · Requisições · Revisões · Garantias
- [ ] Tags do Omie, feedbacks, notas fiscais (anexar, substituída, pedido certo), boleto
- [ ] Mandar OS para o financeiro (auto ou manual); criar cliente/projeto; sync Omie
- [ ] Ficha do projeto/máquina (/clientes/projeto)
- [ ] Relatório semanal de faturados sem nota (/clientes/relatorios)

## Telas soltas de Serviços
- [ ] Agenda dos Técnicos (/agenda-tecnicos) — sem menu
- [ ] Painel de TV da oficina (/tv-painel) — sem login: técnico a caminho/no cliente/oficina, agenda do dia, GPS

---

# 3. PEÇAS
Faixa laranja: Pré-Pedido · Dashboard · Catálogo · Etiquetas · Retiradas · Orçamentos · Requisições

## PPV – Pré-Pedido de Venda (/ppv)
- [ ] Visões Cards / Lista / Relação; arrastar muda fase
- [ ] Busca, filtro Pedido × Remessa, prévia ao passar o mouse
- [ ] "Reservado/agendado" marca data na OS
- [ ] Histórico da peça (em quais pedidos foi usada); lista de estoque
- [ ] Menu: Kits de revisão (copiar kits entre tratores), produto manual/provisório, atualizar preços do Omie
- [ ] Relação: PDF, CSV, e-mail; envio automático toda segunda
- [ ] Versão celular com liberação por QR
- [ ] **Dashboard**: período, fase, tipo, técnico; valor ↔ quantidade; previsão de faturamento
- [ ] **Janela do pedido – abas**: Itens · Departamentos · Informações · Parcelas · Observações · SEFAZ
- [ ] Vendedor, desconto, parcelas, cenário fiscal, CMC por item
- [ ] Novo item (mais usadas, busca, catálogo, kit)
- [ ] Enviar ao Omie, faturar NF-e, DANFE, PDF, duplicar
- [ ] Anexos, tarefas do pedido, ocorrência, histórico, cancelar com motivo
- [ ] Ler QR da peça; ficha do item com impostos (ICMS, ST, IPI, PIS, COFINS)

## Catálogo (/ppv/catalogo)
- [ ] Marca → linha → modelo → sistema → desenho numerado
- [ ] Zoom, tela cheia com caneta, PDF do desenho
- [ ] Carrinhos salvos, link público (/carrinho/[token]), planilha Zeitten
- [ ] Mandar carrinho para pedido ou orçamento

## Etiquetas (/ppv?tab=etiquetas)
- [ ] Últimas compradas, busca, várias de uma vez; NOVA + CASTRO numa etiqueta
- [ ] Fila de impressão compartilhada, histórico, ajuste em mm, escolha de papel
- [ ] QR das peças rastreadas; código de barras opcional; aviso "sem locação"

## Retiradas (/ppv/unidades)
- [ ] Abas: Aguardando liberação · Liberadas · Devoluções · Em estoque · Todas · Conferência
- [ ] Liberar/recusar/devolver/receber; selo Faturado/A faturar/Sem nota
- [ ] Liberação pelo celular (/ppv/liberacao/[id]) lendo QR
- [ ] Página pública da peça (/p/[id]): "Peguei esta peça", devolver, extraviada

## Orçamentos (/orcamentos)
- [ ] Tipos: Peças · Mão de Obra · Completo
- [ ] Vira PPV / OS / OS+PPV
- [ ] Vários serviços com mão de obra e deslocamento; parte desligada como cortesia
- [ ] PDF, validade; aviso de orçamento vencido para quem criou

## Requisições (/requisicoes)
Abas: Kanban · Fornecedores · Relatório · Lixeira
- [ ] 4 fases: Pedido Realizado · Atualizada por Técnico · Aguardando Fornecedor · Enviado Financeiro
- [ ] Filtro único + data exata; grupos; agrupar por fornecedor; comparar duas
- [ ] Tags; mapa de cotações (5 fornecedores, obs + anexo)
- [ ] Anexos com recorte; várias fotos viram um PDF; imprimir
- [ ] Criar conta a pagar no Financeiro
- [ ] OS preenche cliente/chassi/horímetro; manutenção de veículo abre pendência na Frota
- [ ] Bloqueio acima de R$ 500 com liberação pelo Dev
- [ ] Ao vivo com o app do técnico; lixeira sem exclusão definitiva

---

# 4. FINANCEIRO

## Financeiro (/financeiro) — cada função cai no seu painel
Guias Financeiro: Painel · Kanban · Despesas · Rastreio · Vencidos · Relatório
Guias Pós-Vendas e Peças: Painel · Kanban · Despesas · Vencidos
- [ ] **Painel do Financeiro**: Faturamento · Contas a Pagar · Cliente sem boleto; enviar a pagar ao Omie; anexos; histórico
- [ ] **Kanban do Financeiro**: Gerar Boleto · Enviar · Aguardando · Vencido · Pago · Sem Boleto; envio automático do boleto; juntar cards
- [ ] **Painel / Kanban Pós-Vendas**: cards de oficina; alerta "aguardando Omie" > 30 dias; preferência de envio por cliente; e-mail remetente
- [ ] **Painel / Kanban Peças**: igual ao Pós-Vendas, filtrado Peças Balcão
- [ ] **Despesas**: resumo, gráfico mensal, ranking de categorias, reclassificar, CSV
- [ ] **Rastreio**: achar NF, requisição, boleto; anexos em ZIP; ligação automática/manual
- [ ] **Vencidos**: pedir recobrança, marcar pago com comprovante
- [ ] **Relatório a Pagar**: top fornecedores, filtros, imprimir
- [ ] Novo chamado NF · Novo chamado RH · Novo pagar/receber (importa XML/DANFE, requisição, RPA)

## DRE Financeiro (/dre-financeiro) — seletor NOVA / CASTRO / TODAS
- [ ] Home: semáforo de saúde e indicadores
- [ ] **Caixa**: Calendário · Vencidos · Curva de Saldo · Fluxo (Sankey, Treemap, comparativo)
- [ ] **Prazos**: Ciclo de Caixa · Pontualidade
- [ ] **Resultado**: DRE (competência/Omie, intercompany) · Análise DRE · Composição
- [ ] **Patrimônio**: Patrimônio (foto do dia, histórico × Selic) · Rentabilidade · Lucratividade (simulador) · Margens
- [ ] **Comercial**: Vendas por Modelo · Clientes (curva ABC, inadimplência)
- [ ] **Qualidade**: Monitor (robôs que conferem o Omie; criar tarefa de correção)
- [ ] Movimentos de conta corrente (/dre-financeiro/movimentos) — escondida, só por endereço

## Painel Omie (/painel-omie)
- [ ] Ponte para o sistema externo de relatórios (oficina, peças, comercial, comissões)

---

# 5. COMERCIAL

## Proposta Comercial (/propostas)
Guias: Propostas Cliente · Pedidos Fábrica · Resumo · Lixeira
- [ ] Nova proposta / pedido de fábrica; converter pedido em proposta
- [ ] PDF com bloco de assinatura (exige carimbo do vendedor)
- [ ] Ficha técnica, frete, prazo, validade, pagamento
- [ ] Termômetro, previsão de faturamento, motivo da perda/concorrente
- [ ] Tags, histórico, cadastro de cliente/trator/implemento; sync Omie
- [ ] PDF dos pedidos em aberto com previsão ponderada

## Feedbacks & CRM (/feedbacks)
Guias: Atendimento · CRM · RFM · Histórico · Relatórios · Agenda · Oportunidades
- [ ] **Atendimento**: fila do dia; "Atender" abre o cockpit
- [ ] **Cockpit**: ligação com cronômetro, notas, 6 desfechos, roteiro, humor/qualidade, contatos do WhatsApp, máquinas com histórico, OS/PV/PPV, imóvel CAR, modo bloqueado
- [ ] Contatos por cargo (/feedbacks/atendimento/contatos)
- [ ] **CRM** (pós-serviço) e **RFM** (contato ativo)
- [ ] **Histórico de atendimentos** por cliente
- [ ] **Relatórios**: Geral · Atendentes · Por dia; ranking; CSV
- [ ] **Agenda** de retornos
- [ ] **Oportunidades**: 7 regras automáticas, kanban/lista, recalcula 06:00

## Supervisor Vendas (/supervisor-vendas)
Guias: Visão Geral · Vendedores · Visitas · Pós Vendas · Mapa · Alertas
- [ ] Visitas do CRM externo; carros comerciais ao vivo e rota do dia

## Vendas por Modelo (/vendas-modelo)
- [ ] Receita/quantidade por modelo, grade anual T1–T4, mapa de calor, PDF, log de uso

## Marketing & Eventos (/marketing)
Guias: Ações · Apoio Fábrica · Investimento · Leads · Resultados
- [ ] **Ficha da ação – abas**: Resumo · Apoio · Investimento · Leads · Propostas · Equipe · Itens · Ações · Concorrentes · Mídia · Avaliação · Questionário · Relatório
- [ ] Questionário pós-evento por link (/q/[token])
- [ ] PDF para a fábrica; custos puxados de requisição/NF; ROI
- [ ] Apoio Fábrica: pleiteado → aprovado → documentado → faturado → recebido; aviso semanal

## Captura de Leads (/lead)
- [ ] Tela de celular para estande, funciona offline, QR do evento

## Gestão de Vendas (/gestao-vendas) — sem item no menu, só card do Dashboard
Guias: Dashboard · Vendas do Mês · Ajustes por Venda · Custos Mensais · Relatórios
- [ ] Vendedor/custo/comissão por item; carimbos do PDF
- [ ] Relatórios: Geral · Individual · Matriz por vendedor

## Dashboard Agro (/dashboard-agro) — no grupo Outros
Guias: Dashboard · Inteligência por CAR · Mapa dos imóveis · Prospecção · Vínculos
- [ ] Ficha do imóvel; regras de oportunidade; aceitar/rejeitar vínculo imóvel↔cliente

## Outras telas comerciais
- [ ] War Room (/war-room) — pauta semanal, ponte de caixa, plano de ações (sem menu)
- [ ] CRM de Desova (/crm) — DEMONSTRAÇÃO com dados de exemplo (sem menu)
- [ ] Chatwoot App (/chatwoot-app) — vincula contato do WhatsApp a cliente do portal

---

# 6. ESTOQUE

## Visual Estoque (/visual-estoque)
Guias: Dashboard · Showroom · Pátio · Remessas · Notas de Entrada · Margens · Alertas
- [ ] Dashboard: máquinas, valor, custo de capital (Selic), peças por tipo
- [ ] Showroom: vitrine com fotos
- [ ] Pátio: mapa das áreas, arrastar máquina, demonstração, buscar fotos
- [ ] Remessas: Remessas · Demonstração · Outras Entradas; cruzar devoluções
- [ ] Notas de Entrada (máquinas), Margens (negativas), Alertas (zerado/baixo)

## Consulta Estoque (/estoque) — menu interno: Consulta · Entradas · Análise · Admin
- [ ] Busca de produto, gráfico de CMC, observação
- [ ] Dashboard de Vendas (peças+serviços / máquinas), CSV
- [ ] Cadastro de Produto · Movimentação de Produto (DANFE, snapshot)
- [ ] Notas de Entrada (DANFE, contas a pagar, aviso de NF "em recebimento")
- [ ] Recebimentos (dar entrada com CFOP, associar/criar produto)
- [ ] Recebimentos (Omie) (concluir/reabrir no Omie)
- [ ] Curva ABC (+ Inativos) · Giro de Estoque · Cruzamento por Família (reconciliação)
- [ ] Inteligência Comercial: Compras · Clientes · Oportunidades
- [ ] Sugestão de Compra: alertas, safra, previsão 30/60/90, gerar pedido de compra
- [ ] Comissão: Config · Pessoas · Regras · Serviços · Vendas · Custos · Relatório
- [ ] Admin · Admin CMC · Config. de Compras · Ignorar Clientes

## Ajustes Estoque (/ajustes)
- [ ] Dashboard CMC (custo distorcido por garantia)
- [ ] Ajuste de custos · Correção de contas · Devolução de compra · Baixar contas
- [ ] Inventário rotativo (ciclos ABC) + Contagem cega + Relatório de contagem
- [ ] Características (edita no Omie, "A alocar") · Localização física (prateleira/andar/caixa)
- [ ] Famílias · Descrições · Sistema/Sub-sistema · Omie em massa
- [ ] Estoque negativo · Pedidos abertos (+ antigos, encerramentos) · Remessas em aberto
- [ ] Notas fiscais · Arquivo Mahindra · Alertas CMC · Saúde mensal · Histórico (desfazer)

---

# 7. FROTA

## Frota (/frota) — grupos: Início · Cadastro · Operação · Custos
- [ ] **Visão geral**: indicadores, cartões dos veículos, ficha (FIPE, CRLV lido por IA, documentos, venda/arquivo)
- [ ] **Motoristas**: CNH, veículos, multas
- [ ] **Mapa**: ao vivo, trajeto do dia, locais, visitas, quem estava com o carro
- [ ] **Paradas**: km, partidas, motor ligado parado, paradas estranhas
- [ ] **Multas**: lançamento manual, prazo de indicar condutor, pontos por motorista
- [ ] **Avarias**: dano, desconto em folha (RH)
- [ ] **Manutenções**: Rota Exata + portal + requisições
- [ ] **Checklists**: situação do mês; checklist pelo celular (/frota/checklist/[placa])
- [ ] **Abastecimento**: planilha do cartão; Visão geral · Veículos · Motoristas & Postos · Auditoria · Transações; PDF
- [ ] **Álcool × Gasolina**
- [ ] **Custos**: por veículo e por km, por departamento
- [ ] **Pendências**: Cadastro/Checklist/Manual, sistema › componente, duplicada

## Pendências Frota (/pendencias)
- [ ] Versão celular: foto e responsável obrigatórios; cria requisição junto

---

# 8. OUTROS
- [ ] **Opa** (/opa): Ocorrências (Abertos/Concluídos; ligar a veículo) · Peças S/Estoque
- [ ] **Peças S/Estoque** (/opa/pecas): Captação · Separação · Verificação · Destino; etiquetas 3×10; leitor de QR; página da peça
- [ ] **Atividades** (/atividades): log de ações · Uso do portal
- [ ] **Avisos** (/avisos): comunicados, agendar, quem leu (portal + app dos mecânicos) — só pelo Dashboard
- [ ] **Administração** (/admin): usuários, módulos e permissões por tela, desativar e passar tarefas, reset de senha, avisos do Tratorilson, logins órfãos
- [ ] **Sincronizações** (/agendamentos, admin): catálogo dos robôs e última execução
- [ ] **Tratorilson** (/tratorilson, dev): uso/limite, ensinar dúvidas, atualizar OS pelo relatório
- [ ] **Envios de e-mail** (/dev/envios-email, dev): relatórios por e-mail, destinatários, teste
- [ ] **Tela dividida** (/split)
- [ ] **Meu Painel** (/meu-painel): painel do técnico (hoje, pendências, ocorrências, garantias)
- [ ] Login (criar conta fica sem acesso até admin liberar) · Redefinir senha

---

# 9. RECURSOS DE TODAS AS TELAS
- [ ] Atalhos do topo (apps mais usados)
- [ ] Sino de notificações com preferências por módulo
- [ ] Chat interno (individual/grupo, anexos, áudio)
- [ ] Tratorilson (mascote/chat de IA; cria coisas com confirmação)
- [ ] Caixa de e-mail pessoal
- [ ] Ícone WhatsApp: kanban das solicitações do Tratorilson (Pós-Vendas)
- [ ] Vigia das câmeras (aviso do DVR)
- [ ] Lembretes para si ou para outros
- [ ] Configurações: Perfil · Aparência · Som
- [ ] Aviso urgente que trava a tela; lembretes do Opa, SAT e orçamento vencido
- [ ] Atualização automática sem perder o que foi digitado; recuperar rascunho
- [ ] Clique direito: relatar falha com print, ocorrência, abrir ticket
- [ ] Monitor de uso

---

# 10. ROBÔS (horário de Brasília)

**Estoque/Ajustes**: sync de vendas e OS (:05/:35, 6h–20h) · recebimentos (15 min, 6h–19h) · saldo de estoque (3 h) · produtos (02h00) · movimentos (02h20) · CMC das vendas (02h45) · compras (03h30) · sugestão de compra (03h30) · serviços das OS (03h30) · remessas (04h15/13h15) · enriquecer notas (04h30) · Selic (07h30) · negativos (01h00) · características (03h00) · pré-carga recebimentos (04h00) · classificar recebidos (05h/10h) · notas de saída (3 h)

**Clientes/Pós-Vendas/Garantias/Peças**: sync completo de clientes (05h30) · NFs nas pastas (05h/12h/17h) · relatório semanal sem nota (sexta 08h) · cadastros do POS (05h10) · fase automática das OS (05h40) · vigia de revisões (06h40) · separar peças véspera (15h) · e-mails de garantia (07h30/12h) · devolução de peças (08h) · garantias perdidas (de hora em hora) · baixa de peças retiradas (30 min)

**Financeiro/DRE/PPV/Marketing**: contas a pagar/receber (3 h) · e-mail títulos novos (seg 07h) · e-mail PPVs abertos (seg 07h10) · apoios vencendo (seg 07h20) · e-mails de boleto (09h/13h/17h) · War Room (seg 06h) · oportunidades CRM (06h)

**Comercial/Frota**: rotas comerciais (01h30 e 04h00) · cadastro Rota Exata (03h10) · fechar dia dos veículos (04h20) · ocorrências automáticas (05h) · multas/manutenções (06h/18h) · FIPE (dia 5)

**Outros**: fechar tickets resolvidos há 7 dias (06h20) · fechar carrinhos (06h30) · publicar avisos (15 min) · registrar versão nova na Base de conhecimento

**Dentro do servidor**: pasta do cliente (5 min) · Tratorilson processa relatórios de OS (10 min) · vigia do WhatsApp (5 min) · saúde dos robôs (1 h) · alocação de peças (10 min) · replanejar cronogramas (06h) · monitor de uso (1 min)

---

# 11. PROBLEMAS ENCONTRADOS

## Podem estar quebrados
- [ ] **Ajustes › Antecipações** está na lista mas a tela não existe (link dá erro)
- [ ] **Lousa**: o módulo não existe no Admin → só admin consegue ver
- [ ] **Mapa Técnico**: a página pede permissão "mapa", o menu confere "mapa-geral"
- [ ] **Agenda dos Técnicos** e **SAT** sem trava de permissão
- [ ] **Painel Financeiro** não tem "Chamado RH" no botão Novo (Pós-Vendas e Peças têm)
- [ ] **Tela Sincronizações** desatualizada: mostra ~23 de 41 robôs, vários horários errados
- [ ] Lembretes de revisão sem robô que dispare

## Duplicadas (escolher uma)
- [ ] Recebimentos × Recebimentos (Omie)
- [ ] Notas de Entrada do Visual Estoque × do Estoque
- [ ] Pendências Frota × Frota › Pendências
- [ ] Agenda dos Técnicos × Lousa
- [ ] Rentabilidade = Margens + Lucratividade
- [ ] Dois "Vencidos" (Financeiro e DRE) e dois "Alertas" (Visual Estoque e Ajustes) com assuntos diferentes
- [ ] Remessas no Visual Estoque × Ajustes
- [ ] Robôs de rotas comerciais (01h30 × 04h00) fazem quase o mesmo
- [ ] Configurações do Financeiro repete o Perfil do topo
- [ ] "CRM" demo (/crm) × CRM real (/feedbacks/crm)

## Sem menu (só por endereço ou link)
- [ ] Financeiro: Configurações, Dashboard, Histórico a Receber, Histórico RH, Logs
- [ ] Conferência de Custos (/conferencia-custos)
- [ ] /crm (demo), /war-room, /clientes/projetos, /cronograma/calendarios, /cronograma/recursos
- [ ] /meu-painel, /agenda-tecnicos, /tv-painel
- [ ] Gestão de Vendas, Avisos e Solicitações de Compras: só pelo Dashboard/busca

## Lixo para apagar
- [ ] Só redirecionam: /consulta-omie, /abastecimento, /abastecimento/flex, /visual-estoque/frota, /frota/veiculos, /painel-mecanicos, /opa/pecas/fila, /ppv/etiquetas, /cheque/[token]/assinar
- [ ] Painel Mecânicos: ~6.400 linhas de componentes sem uso (módulo ainda aparece no Admin)
- [ ] Componentes sem uso: POS (KanbanGrid, OSCard, FilterBar, ClientDrawer, OSorcamentosInfo, ModalBuscaOrcamento), PPV (quadro antigo, janela antiga, barra lateral antiga, rastreio Correios, categorias NF-e), Requisições (cadastro de usuário), Supervisor (MapaVisitas), Feedbacks (MiniMapaCliente, CadastroOmieSecao), chat antigo do Financeiro
- [ ] Guias antigas da Central (Minha fila/Meus pedidos/Acompanhando); "minhas tarefas" carregadas no Dashboard sem aparecer

## Organização do menu
- [ ] Clientes está em Serviços (permissão diz Comercial)
- [ ] Dashboard Agro e Opa estão em Outros
- [ ] Nomes confusos: "Visual Estoque" usa permissão `consulta-estoque`; "Consulta Estoque" usa `estoque`
