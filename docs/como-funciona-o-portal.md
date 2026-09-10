# Portal Nova Tratores — Como funciona (visão geral completa)

> Resumo de todos os sistemas do portal, do app dos mecânicos e do NovaZap (WhatsApp),
> em linguagem simples, pra qualquer pessoa da equipe entender o que existe e como as
> coisas se conectam. Atualizado em 09/09/2026.

O portal roda em **portalnovatratores-production.up.railway.app**. Cada pessoa entra com
seu login e só enxerga os módulos que o administrador liberou pra ela.

---

## 1. Pós-Vendas (POS) — Ordens de Serviço

O coração da oficina. Cada serviço vira uma **OS** que anda num quadro de fases:

**Orçamento → Orçamento enviado → Orçamento Aprovado → Execução → Relatório → Enviar Omie → Concluída**

- **Card da OS**: número, cliente, técnico, valor, datas de execução/faturamento e a solicitação do cliente.
- **Checkbox "Reservado"**: quando o cliente aprova o orçamento, marca o checkbox no card →
  o sistema pergunta **pra qual dia ficou agendado**, move a OS pra **Orçamento Aprovado**
  e já grava a **Data Início do Serviço**. No dia marcado, a OS vira **Execução sozinha**.
- **Drawer da OS** (abrir o card): visual espelhado no Omie — cliente com CPF/CNPJ (troca por
  modal de busca), técnicos, desconto em % ou R$, caixa de totais (Serviços, Deslocamento,
  Descontos, Produtos, Total), abas de Lista de Serviços, Produtos, Requisições, Relatório
  Técnico, Alimentação, Garantia, Observações e Histórico.
- **Ícone de trator 🚜** ao lado do cliente: mostra todas as máquinas daquele CPF/CNPJ
  (modelo, chassis e última revisão) — as mesmas da Pasta Clientes.
- **Valores**: horas × valor da hora + km × valor do km + peças do PPV + requisições − descontos.
  Os valores de hora e km são configurados no próprio POS e valem pra tudo (inclusive o Tratorilson).

### Automações da OS
- **Relatório do técnico**: quando o mecânico envia o relatório pelo app, o Tratorilson (IA)
  preenche a OS sozinho a cada ~10 min — horas, km, datas, descrição do serviço realizado —
  devolve no PPV as peças não usadas e move a fase (garantia → Preenchido; normal → Enviar Omie).
- **Fases por data**: previsão de execução chegou → Execução; passou a previsão de faturamento →
  volta pra Aguardando ordem Técnico (cron diário).
- **Alimentação**: lançou alimentação do técnico na OS → nasce uma Requisição automática; a OS
  concluiu → a requisição vai pro financeiro com a nota anexada.
- **Envio ao Omie**: manual (botão), cria a ordem real no Omie junto com o pedido de peças.

---

## 2. Peças (PPV) — Pré-Pedido de Venda

Sistema de peças, com kanban no mesmo padrão do POS.

- **PPV vinculado à OS**: peças de um serviço viram um PPV ligado à OS. **Tudo anda junto**:
  - a **fase** do PPV acompanha a da OS automaticamente;
  - o **cliente (nome + CPF/CNPJ)** e o **técnico** ficam sincronizados nos dois sentidos
    (mudou num, muda no outro, com registro no histórico);
  - dá pra **desvincular** (✕ no campo da OS dentro do PPV, ou tirando o PPV da lista na OS)
    e vincular a outra ordem.
- **Checkbox "Reservado"** no card do PPV: agenda a OS vinculada (mesma pergunta de data);
  PPV sem OS só muda de fase.
- **Peças em estoque**: lista com busca, colunas **Estoque, Reservados, Estoque real**
  (estoque − reservas confirmadas), ordenada do mais reservado pro menos. Clicar no produto
  abre a **ficha completa** (histórico de compras/vendas, dados fiscais, localização física).
- **Alerta de estoque**: uma reserva deixou o estoque real de uma peça em 2 ou menos →
  notificação no sininho dos admins.
- **Catálogos de peças** (Jivo/Mahindra, Valtra, Tatu, KUHN...): figuras explodidas com
  bolinhas clicáveis que mostram código e preço de cada peça.
- **Carrinhos, orçamentos, etiquetas e retiradas** completam o fluxo do balcão.

### E-mails de separação de peças (novo)
Quando um pedido **com peças** é aprovado com data:
1. **Na hora**: e-mail pro Zezo e pro Danilo — "pedido aprovado pro dia X" com a tabela de peças.
2. **Na véspera às 15h**: resposta no mesmo e-mail pedindo pra **separar as peças**.
   Serviço na segunda → o lembrete sai na **sexta** (domingo não envia). Aprovou depois das
   15h da véspera → a separação sai na hora.
3. Tudo fica registrado no bloco **"E-mails de peças"** do histórico da OS.
Só vale pra serviço **com** peças — só serviço ou só peça não dispara.

---

## 3. Requisições (compras internas)

Kanban: **Pedido Realizado → Atualizada por Técnico → Aguardando Fornecedor → Enviado Financeiro**.

- Tipos: Peças, Insumo Infra, Alimentação, Veicular (abastecimento/manutenção), Serviço de
  Terceiros etc. Setores: Trator-Cliente, Trator-Loja, Oficina, Comercial.
- **Alimentação com NF anexada pula direto pro financeiro.**
- Anexos por card (NF, boleto, recibo), impressão em template próprio, cotações, tags,
  modo lista, lixeira (sem exclusão permanente) e histórico de alterações por card.
- **Fornecedores**: cadastro com preenchimento automático por CNPJ (Receita) e CEP; a ficha
  do fornecedor mostra todos os dados com botão de **copiar** campo a campo (e "copiar tudo"),
  além do histórico de compras por mês.
- **Valor alto (> R$ 500)**: requisição bloqueia pra edição; só o Dev aprova alteração
  (Painel do Dev), e a aprovação vale pra UMA mudança.

---

## 4. Financeiro

Kanbans de cobrança (oficina e peças): **Gerar Boleto → Enviar pro Cliente → Aguardando →
Pago/Vencido → Concluído**.

- Cards com NF, forma de pagamento, vencimento, parcelas (bolinhas pagas/vencidas) e
  preferência de envio do cliente (e-mail/WhatsApp).
- **Juntar cards**: cobranças do mesmo cliente viram UM boleto — o card principal acumula o
  valor e as NFs (selo "🔗 X cards juntados"), os outros somem do quadro; dá pra desfazer
  card a card no modal. E-mail de cobrança e boleto saem com todas as NFs.
- Envio de boleto pelo **e-mail do próprio usuário** (senha de app criptografada), com
  histórico de e-mails por card.
- **Caixa de e-mail no cabeçalho do portal**: cada usuário conecta seu Gmail e lê/responde
  sem sair do portal — abas **Caixa de entrada / Enviados / Spam**, busca, e as mensagens
  abrem em **modo conversa** (os dois lados da troca, como no Gmail).
- Requisições aprovadas chegam do outro lado; DRE, vencidos e dashboards completam o módulo.

---

## 5. Clientes (Pasta Clientes)

Uma pasta por cliente (por código Omie + CPF/CNPJ):

- Dados cadastrais, máquinas (projetos faturados pro documento), OSs, PVs, NFs com PDF,
  requisições e histórico completo.
- As NFs são baixadas automaticamente do Omie (webhook + sincronizações); só PDF de verdade
  é salvo — link de portal (NFS-e Nacional) fica como link.
- Deep-link: outras telas abrem a pasta direto (ex.: `/clientes?cod=...`).

---

## 6. Frota

- **Veículos**: cadastro, fotos, documentos, custos (TCO), FIPE automático.
- **Abastecimento**: une o CSV do cartão-frota com as requisições de abastecimento (só as
  que chegaram ao financeiro). Rankings, heatmaps, auditoria de intervalos, km/L, e PDFs
  (analítico e "por departamento" no formato da tabela dinâmica do Excel).
- **Pendências**: toda pendência de veículo registrada (manual, cadastro, checklist,
  requisição de manutenção, OS com placa no projeto, Opa vinculado) com taxonomia
  Sistema › Subsistema › Componente, abertura/fechamento automáticos e alerta de recorrência
  ("era pra durar mais"). Existe também o módulo enxuto **/pendencias** (mobile, com foto
  obrigatória) pra quem não usa a Frota inteira.
- **Motoristas**: mescla com o RH (CPF), CNH e validade.
- **Ocorrências automáticas** (velocidade, uso fora de hora etc.) via rastreador.

---

## 7. Mecânicos (app dos técnicos)

App separado pros técnicos no celular:

- **Agenda semanal** e lista de OSs (com destaque de atrasadas — previsão vencida).
- **Preencher relatório**: datas, horas, km, horímetro, fotos obrigatórias (horímetro,
  chassis, 4 lados, falhas, peças), assinaturas do cliente e do técnico, justificativa de
  atraso quando passa de 2 dias, alimentação com foto da nota.
- Enviou → o portal preenche a OS sozinho (ver Pós-Vendas) e o card mostra no portal a
  situação: **preenchido em tal dia** / **ainda não preencheu** / **atrasado há X dias**.
- Notificações push de mudanças de fase e ocorrências.

### Ocorrências (pontos)
Qualquer gestor registra ocorrência (OS, PV, RH, Frota) num modal único: subcategoria com
pontos do catálogo + **pontos extras manuais** pra agravar, observação obrigatória, anexos.
O funcionário é notificado (app + portal) e pode justificar; o RH acompanha tudo.

---

## 8. Tratorilson (assistente de IA)

### No portal (chat interno)
Responde só sobre os módulos que o usuário tem acesso. Consulta dados reais: peças e
catálogos, histórico de clientes, projetos/chassis com controle de revisões, financeiro,
planos de revisão. **Executa ações**: cria OS (com kit de revisão importado sozinho pelas
horas), PPV, requisição, corrige campos de OS. Registra tudo (tokens/uso) no painel
`/tratorilson`, com limite mensal configurável.

### No WhatsApp (NovaZap)
Atende clientes como "**do pós-vendas da Nova Tratores**" (nunca diz que é robô):
- Entende texto livre, fotos de **horímetro e chassis** (confirma a leitura antes de usar);
- Monta **orçamento de revisão** com as peças e preços reais do banco, mão de obra pela
  tabela (50h/900h cortesia; 300/600 = 2h; 1200 = 6h; ciclo repete acima disso), pagamento
  padrão 30 dias, num formato bonito pro celular;
- Calcula **deslocamento real** (rota da oficina de Piraju, ida e volta × valor do km do
  POS) a partir de localização, endereço ou link do Maps;
- Cliente confirmou → registra a **solicitação** no portal (kanban no ícone do zap:
  Novas → Orçamento → Aguardando data → Agendado → Execução → Concluídas, com botão de
  gerar orçamento POS+PPV);
- Peça avulsa ou venda → não confirma nada: passa o contato do Zezo (peças) ou do Douglas
  (comercial) e avisa o responsável;
- Não sabe → fica em silêncio e aciona o pós-vendas no portal (card vermelho, que some
  quando alguém assume a conversa).
- **Modo teste ativo**: por enquanto só responde o número do José.

### Memória única + Modo Ensino (Dev)
Os dois Tratorilsons compartilham a **mesma memória** de regras. No painel `/tratorilson`
(ou Menu → **Ensinar o Tratorilson**, só Dev) tem um chat de ensino: o Dev explica, ele
reescreve a regra, escolhe onde vale (portal, WhatsApp ou os dois) e grava. Editar uma
regra ali **vale na hora**, sem deploy. As regras já ensinadas até hoje estão todas lá.

### NovaZap (ChatWoot)
Central do WhatsApp da empresa: conversas com pílulas **Robô/Manual**, ficha do contato com
cliente Omie vinculado, máquinas do CNPJ e **localizações (fazendas)** — quantas quiser,
cada uma com nome + link do Maps; com várias, o bot pergunta em qual fazenda é o atendimento.

---

## 9. Outros módulos

| Módulo | O que faz |
|---|---|
| **Garantias** | Fluxo de garantia das OSs, peças devolvidas, e-mails automáticos |
| **Controle de Revisões** | Régua de revisões por chassis (feitas, última, próxima pendente) |
| **Estoque / Ajustes** | Sincronizações com o Omie, CMC, correções assinadas (tamper-evidence), inteligência comercial |
| **Tickets** | Chamados internos com timeline imutável, transferência e auto-fechamento em 7 dias |
| **Marketing & Eventos** | Feiras, apoio de fábrica, custos, leads, ROI e questionário pós-evento por link |
| **Vendas por Modelo** | Comercial: vendas consolidadas por modelo |
| **Vigia das Câmeras** | Eventos do DVR da loja no portal; canal 5 só toca se a IA confirmar TRATOR na imagem |
| **Tela dividida** | Dois sistemas lado a lado na mesma tela (`/split`) |
| **Lembretes / Lousa / SAT / Mapa técnico / Cronograma** | Apoio do dia a dia do pós-vendas |

---

## 10. Administração e segurança

- **Permissões por módulo** no Admin; papéis **Usuário / Admin / Dev** (Dev = Admin + extras:
  aprovar requisição de valor alto, ensinar o Tratorilson, telas de envio de e-mail).
- **Auditoria**: ações importantes viram log (audit_log + históricos por card).
- **Notificações**: sininho do portal (por módulo, com silenciamento individual), push no app
  dos mecânicos, e-mails automáticos.
- **Crons (GitHub Actions)**: fases por data, relatórios por e-mail (PPV, DRE, clientes),
  sincronizações Omie/estoque/frota, auto-fechar tickets, lembrete de separação de peças
  (15h), entre outros — status de todos na tela **/agendamentos**.
- **Deploy**: push no GitHub → Railway atualiza sozinho (portal e NovaZap).

---

*Dúvidas ou ajustes: falar com o José (Pós-Vendas) — o portal evolui toda semana.*
