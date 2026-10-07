# War Room — funcionamento e tarefas pendentes (03/09/2026)

> Retrato do módulo `/war-room` conferido no código, no cron do GitHub Actions e nas tabelas do Supabase.
> Complementa `docs/war-room-roteiro-verificacao.md` (critérios de aceite) e a memória do módulo.

## Como a ferramenta funciona

O War Room é a **pauta viva da reunião semanal de recuperação financeira** (segundas, 8h).
Ele não tem motor próprio de tarefas: cada ação do plano é um ticket do módulo Tickets com
`tipo='war_room'`, e o módulo acrescenta uma camada estratégica por cima. A tela
`src/app/(portal)/war-room/page.tsx` carrega tudo numa chamada só ao GET agregado
`src/app/api/war-room/route.ts`.

Blocos da tela, de cima para baixo:

- **Farol geral e sentinelas.** Três semáforos por semana:
  - *Margem*: verde acima de 0, amarelo até −5%, vermelho abaixo.
  - *Giro de tratores*: verde com 2 ou mais vendidos, amarelo com 1, vermelho com 0 ou quando
    entradas superam vendas por 4 semanas seguidas.
  - *Caixa*: verde se 90 dias positivo sem depender de antecipação, amarelo se só positivo com
    antecipação, vermelho se negativo.
  - Limiares em `src/lib/war-room/constantes.ts`.
- **Snapshot semanal.** Cron `.github/workflows/war-room-snapshot.yml` toda segunda 06h BRT fecha
  a foto da semana anterior (segunda a domingo, recorte em horário de Brasília). Margem, tratores
  vendidos, entradas no pátio e volume antecipado são derivados sozinhos de vendas, produtos e
  antecipações (`src/lib/war-room/snapshot.ts`). **Caixa 30/60/90 dias é manual**: o núcleo digita
  pelo botão "Digitar caixa da semana". Snapshot fechado vira imutável por trigger no Postgres.
- **Ponte de caixa até dez/2026.** Alvo de R$ 2 milhões dividido em 4 fontes (cobrança dos grandes
  devedores, liquidação de estoque parado, redução de despesa fixa, renegociação banco/fábrica),
  cada uma com meta, realizado e prazo.
- **Plano de ações por fase.** Fase 0 Estancar, 1 Atacar, 2 Redimensionar, 3 Governança. Cada ação
  traz causa-raiz, entregável, indicador, meta, consequência e prazo estratégico. O título abre o
  ticket, onde o dono trabalha, marca resolvido e o solicitante confirma o fechamento em 2 estágios.
  O auto-fechamento de 7 dias dos tickets ignora esse tipo. Núcleo pode cancelar uma ação
  (cancela o ticket, nada é apagado).
- **Pauta automática.** View `v_war_room_pauta` que junta: (a) ações vencidas, (b) sentinelas
  vermelhos do último snapshot, (c) decisões com prazo estourado sem ação vinculada fechada,
  (d) definições pendentes/agendadas com data-alvo nos próximos 7 dias ou vencida. Ao fechar a
  reunião, a pauta é congelada no snapshot (versão completa para núcleo, lite para membro).
- **Ata e definições.** A ata (`war_room_decisoes`) é append-only por trigger. Uma decisão pode
  "virar ação" uma única vez. Uma definição só passa a `decidida` quando existe uma decisão na
  ata apontando para ela.
- **Acesso por lista explícita**, nunca por cargo (`war_room_membros`). Nível `nucleo` vê tudo.
  Nível `membro` vê plano e sentinelas sem valores de caixa, ponte ou definições. O corte é feito
  no banco, por RLS e views, e a lista se gerencia em `/war-room/config`. O botão "Gerar PDF"
  monta o A4 a partir do mesmo payload, então respeita o corte.
- **Escrita só via API** (`/api/war-room/*`, service role). Nenhuma policy de escrita para
  `authenticated`.

## Estado real em 03/09/2026

O código está em produção desde 16/08 (main `6a9fa4c`), com o incremento de 18/08 (`093a2de`:
PDF, cancelar ação, título como link). O cron rodou com sucesso em 17/08, 24/08 e 31/08, o que
confirma que `CRON_SECRET` e `PORTAL_URL` estão configurados no Railway e no GitHub. A pendência
antiga de segredo está resolvida.

O uso, porém, não começou:

| Item | Situação |
|---|---|
| Snapshots | 4 (semanas de 03/08 a 24/08), nenhum fechado |
| Caixa 30/60/90d | Nunca digitado, nulo nos 4 |
| Ata (decisões) | 0 registros |
| Definições | 6, todas `pendente` e sem data-alvo |
| Ponte | Realizado R$ 0 nas 4 fontes |
| Ações | 14 tickets (#17–#29 + #31), todos em `aberto`, 1 evento desde 18/08 |
| Membros | Núcleo: Amelia, Henri, Jose Camargo (Reserva Ortiz inativo) |
| Módulo no Admin | Ninguém tem `war-room` em `modulos_permitidos` |

## Tarefas pendentes

1. **Liberar o módulo no Admin.** Ninguém tem `war-room` em módulos permitidos. O gate
   (`temModuloWarRoom` em `src/lib/war-room/server.ts`) deixa passar só admin ou dev. Amelia e
   Jose Camargo estão no núcleo mas não são admin, então recebem 403 ao abrir a tela. Pollyane,
   dona de 2 ações, também não entra. Mariano, Vinicius e Henri entram por serem admin/dev.
2. **Montar a lista núcleo/membro com a direção.** Mariano, Vinicius e Pollyane são donos de ações
   e não estão na lista.
3. **Rodar a "semana zero".** Fechar a primeira reunião com itens marcados "TESTE —" para validar os
   blocos B2, C, D e G do roteiro de verificação, que nunca foram executados. A ata é imutável,
   por isso a semana de teste precisa ser contida num snapshot só.
4. **Completar a ação #31.** Criada por Mariano em 26/08 ("Atualizar com fornecedores custo atual
   das máquinas...") sem entregável, indicador ou meta.
5. **Corrigir truncamento em 1000 linhas.** A auditoria de setembro (`docs/auditoria-portal-2026-09.md`,
   P3) aponta que `src/lib/war-room/snapshot.ts:90-127` soma sobre consultas cortadas pelo
   PostgREST. A margem semanal pode sair subestimada quando a semana passar de 1000 itens de venda.
6. **Envolver o cron com `comCronRun`.** Ele ainda não passa pela trava e observabilidade de
   `cron_runs` (item 1.2 de `docs/verificacoes-2026-09.md`).
7. **Fase 2 do módulo.** Só existe a Fase 1. Automatizar o caixa (hoje manual por falta de fonte
   de saldo inicial) e o realizado da ponte são os próximos ganhos naturais, mas não há spec escrita.

**Conclusão:** a ferramenta está pronta e íntegra, mas parada por falta de acesso das pessoas
certas e de uma primeira reunião fechada.

---

# Plano de transição de gestão — proposta de ações (03/09/2026)

> Contexto: saída do gerente (Fernando) + entrada de novo diretor. 16 ações no formato do War Room,
> prontas para virar tickets `tipo='war_room'` (via `POST /api/war-room/acoes` ou `scripts/seed-war-room.ts`).
> Donos entre colchetes ("você" = quem opera o sistema). **Ainda NÃO cadastradas no portal.**

## Fase 0 — Estancar

### 1. Auditoria de transição da carteira do Fernando `[novo diretor + você]` — prazo 10/09
- **Causa-raiz:** carteira de clientes, propostas e devedores existia na memória e no WhatsApp do gerente, não no sistema.
- **Entregável:** planilha/lista no portal com toda proposta aberta, cliente em negociação e devedor em conversa, com status e próximo passo.
- **Indicador:** % da carteira identificada que está lançada no sistema. **Meta:** 100% até o prazo.
- **Consequência:** clientes e devedores "somem" sem que ninguém saiba que existiam; a fonte "cobrança dos grandes devedores" da ponte fica sem dono.

### 2. Revogação de acessos e preservação de registros do desligado `[você + RH]` — prazo 05/09
- **Causa-raiz:** não existe procedimento de offboarding; contas e conversas de clientes ficam com a pessoa.
- **Entregável:** checklist assinado (sistema, Omie, e-mail, portal Mahindra, WhatsApp Business, senhas de fábrica) com data de revogação e backup feito.
- **Indicador:** itens do checklist concluídos / total. **Meta:** 100%.
- **Consequência:** ex-gerente mantém acesso a dados e clientes; histórico de conversas se perde.

### 3. Onboarding formal do novo diretor `[RH + você]` — prazo 10/09
- **Causa-raiz:** gestão anterior rodava em contas pessoais, criando dependência de pessoa.
- **Entregável:** e-mail corporativo, telefone com WhatsApp Business, cadastro no portal, termo de responsabilidade sobre equipamento e acessos assinado.
- **Indicador:** itens entregues / total. **Meta:** 100%.
- **Consequência:** novo diretor opera em contas pessoais e a empresa recria a dependência que acabou de custar caro.

### 4. Definição de acessos do novo diretor `[proprietário]` — prazo 11/09
- **Causa-raiz:** não há política de quem acessa o quê; a decisão está recaindo em quem opera o sistema.
- **Entregável:** decisão na ata do War Room definindo nível (membro/núcleo), acesso ao Omie e ao portal da fábrica.
- **Indicador:** decisão registrada (sim/não). **Meta:** registrada na reunião de 07/09.
- **Consequência:** ou se abre demais sem responsável, ou se segura informação e o diretor não consegue dirigir.

### 5. Fechar a semana zero do War Room `[você]` — prazo 07/09
- **Causa-raiz:** módulo em produção há 3 semanas sem nenhuma reunião fechada; ata vazia.
- **Entregável:** primeiro snapshot fechado com pauta congelada, ata com ao menos a decisão da ação 4, módulo liberado no Admin para o núcleo.
- **Indicador:** snapshots fechados. **Meta:** 1 até 07/09; depois 1 por semana.
- **Consequência:** a transição inteira acontece sem registro; o plano de recuperação continua sendo conversa.

### 6. Digitar caixa 30/60/90 dias `[financeiro]` — recorrente, primeira em 07/09
- **Causa-raiz:** não existe fonte de saldo inicial automatizada; o campo manual nunca foi preenchido.
- **Entregável:** caixa projetado digitado toda semana antes da reunião.
- **Indicador:** semanas com caixa preenchido / semanas. **Meta:** 100% a partir de 07/09.
- **Consequência:** sentinela de caixa nunca acende; a direção não sabe se sobrevive 90 dias.

## Fase 1 — Atacar

### 7. Mapa de risco de pessoas-chave `[proprietário + RH]` — prazo 18/09
- **Causa-raiz:** funções críticas dependem de indivíduos e há sinais de saída voluntária.
- **Entregável:** matriz (mantida fora do portal) com função, criticidade, sinal de risco, custo de reposição e ação de retenção.
- **Indicador:** conversas de retenção realizadas / pessoas mapeadas como críticas. **Meta:** 100% conversadas.
- **Consequência:** saída em cascata sem substituto; operação para junto com a recuperação.

### 8. Plano de sucessão mínimo por função crítica `[novo diretor]` — prazo 25/09
- **Causa-raiz:** ninguém sabe quem cobre quem se alguém sair amanhã.
- **Entregável:** tabela função × substituto imediato × o que está documentado × lacuna.
- **Indicador:** funções críticas com substituto definido. **Meta:** 100%.
- **Consequência:** cada saída vira apagão operacional, como agora.

### 9. Documentação de processos que vivem só na cabeça de alguém `[cada dono de área; coordenação sua]` — prazo 09/10
- **Causa-raiz:** proposta, faturamento, garantia, pedido à fábrica e o próprio portal não têm POP escrito.
- **Entregável:** POPs publicados no portal (inclui runbook do sistema: deploy, crons, restauração de backup).
- **Indicador:** POPs publicados / POPs previstos. **Meta:** 6 até o prazo, incluindo o do sistema.
- **Consequência:** a empresa troca uma dependência de pessoa (gerente) por outra (desenvolvedor).

### 10. Comunicação interna da transição `[novo diretor]` — prazo 08/09
- **Causa-raiz:** silêncio da direção alimenta boatos e acelera quem já está de saída.
- **Entregável:** reunião com toda a equipe + mensagem escrita com o que muda, quem responde por quê e prazos.
- **Indicador:** feita (sim/não) + presença. **Meta:** feita com 100% da equipe até o prazo.
- **Consequência:** equipe decide sair com base em boato, não em fato.

### 11. Regra de lançamento compulsório `[proprietário aprova; você redige]` — prazo 18/09
- **Causa-raiz:** trabalho fora do sistema era tolerado; a cobrança virava atrito pessoal por falta de regra.
- **Entregável:** POP "proposta/atendimento só existe registrado", aprovado pela direção e comunicado por escrito.
- **Indicador:** propostas identificadas fora do sistema por semana. **Meta:** zero em 4 semanas consecutivas.
- **Consequência:** repete-se o cenário Fernando com qualquer gestor novo.

### 12. Reatribuição dos grandes devedores `[proprietário define; dono executa]` — contato 100% até 18/09; recuperação conforme ponte
- **Causa-raiz:** relação com os maiores devedores estava com o gerente que saiu.
- **Entregável:** cada devedor grande com responsável nomeado, contato feito e acordo ou próxima data registrados.
- **Indicador:** R$ recuperado (alimenta a fonte "cobrança dos grandes devedores" da ponte). **Meta:** a já cadastrada na ponte (R$ 1,0 M).
- **Consequência:** a maior fonte da ponte de R$ 2M fica órfã.

## Fase 2 — Redimensionar

### 13. Revisão do plano de redução de despesa fixa `[proprietário + financeiro]` — prazo 30/09
- **Causa-raiz:** saídas voluntárias mudam a base sobre a qual o corte foi planejado.
- **Entregável:** plano de despesa fixa revisado considerando quem saiu, quem vai sair e quem não pode sair.
- **Indicador:** R$/mês de despesa fixa reduzida (alimenta a fonte "redução de despesa fixa"). **Meta:** a da ponte (R$ 400 k).
- **Consequência:** corta-se quem fica e perde-se quem já ia sair, dobrando o dano.

### 14. Novo diretor como dono de ações do plano `[proprietário]` — prazo 11/09
- **Causa-raiz:** nenhuma das 14 ações existentes tem o novo diretor como dono; ele está fora do plano de recuperação.
- **Entregável:** redistribuição das ações órfãs (as do Fernando e as sem dono efetivo) com ele nomeado onde couber.
- **Indicador:** nº de ações com o novo diretor como dono. **Meta:** ≥ 4.
- **Consequência:** diretor gerencia à margem do plano; War Room vira ferramenta de um analista, não da empresa.

## Fase 3 — Governança

### 15. Política de acessos, onboarding e desligamento `[você redige; direção aprova]` — prazo 16/10
- **Causa-raiz:** tudo o que foi feito nas ações 2, 3 e 4 foi improvisado.
- **Entregável:** documento com níveis de acesso por função, checklist de entrada, checklist de saída e responsável por cada etapa.
- **Indicador:** política aprovada (sim/não) e aplicada em 100% das próximas movimentações. **Meta:** aprovada; aplicada na próxima admissão/demissão.
- **Consequência:** o próximo desligamento repete o apagão.

### 16. Disciplina de registro da direção `[proprietário]` — recorrente até 31/12
- **Causa-raiz:** exige-se registro da operação enquanto a direção não registra as próprias decisões.
- **Entregável:** ata fechada toda segunda com pelo menos uma decisão.
- **Indicador:** semanas consecutivas com ata fechada. **Meta:** 12 consecutivas até dez/2026.
- **Consequência:** a direção perde autoridade moral para cobrar dado de quem quer que seja.

## Observações para o cadastro no portal
- A ação 5 engloba as tarefas pendentes 1, 2 e 3 da seção anterior (liberar módulo, lista de membros, semana zero).
- Ações 1, 12 e 13 alimentam fontes já cadastradas na ponte (`war_room_ponte`); ao criar, vincular pelo `acao_id` da fonte.
- Ações 6 e 16 são recorrentes; o motor de tickets não tem recorrência. Cadastrar como ação única com indicador de "semanas consecutivas" e acompanhar pela ata.
- "Fernando" não consta em `financeiro_usu` nem entre os donos das 14 ações atuais (Henri, Amelia, Mariano, Vinicius, Pollyane); confirmar quais ações ficam órfãs antes da ação 14.
- O novo diretor precisa existir em `financeiro_usu` e ter o módulo `war-room` antes de ser dono de qualquer ação (senão a criação falha na participação).
