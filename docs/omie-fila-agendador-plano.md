# Fila da Omie + Agendador no portal — plano

> Escrito em 13/10/2026. Status: **aprovado, decisões respondidas (seção 6).**
>
> **Andamento:** Etapa 0 ✅ (13/10, apêndice A) · Etapa 1 ✅ porta única em todo o portal (13/10,
> commits 7100b494 → 1303a3d4) · Etapa 2 ✅ código no ar em 14/10 (59e166f6) e `sql/agendador.sql` **aplicada 14/10** —
> agendador (`src/lib/agendador`), rotas `/api/agendador`, tela `/agendamentos` nova · Etapa 3 🟡 em
> andamento: características às 20:00 no portal (15/10, GitHub como reserva das 20 h) e os 26
> agendamentos sem Omie trocados direto (15/10; workflows só com botão manual até 14/11/2026,
> depois apagar). Faltam os syncs da Omie (produtos, estoque, movimentos, compras, backfill CMC,
> recebimentos completo, DRE, notas, remessas, pasta completa, NFs…).
> Objetivo: toda chamada à Omie passa por uma porta só, com fila e prioridade, e todos os
> agendamentos passam a rodar dentro do portal (Railway), com uma tela que mostra o que
> está acontecendo de verdade. O GitHub Actions deixa de ser o relógio e vira só o vigia.

## 1. Por que

**Caso que motivou (13/10/2026):** a sincronização de características (localização das
peças em `/ajustes/caracteristicas`) está marcada para 03:00, mas o GitHub a disparou às
10:57. Às 11:03 entrou um deploy, o servidor reiniciou e a rodada morreu no meio (CASTRO
parou na página 25 de 56). Nos três dias anteriores ela falhou porque a chave da NOVA
estava recusada pela Omie. Mesmo assim, o GitHub mostrou "sucesso" em todos os dias.

**Problemas de hoje:**

1. **O GitHub atrasa horas.** O de 03:00 roda entre 9h e 12h; o "a cada 15 min" de
   recebimentos roda 3 a 4 vezes por dia. Isso empurra os syncs pesados para o horário
   comercial, quando há deploy e gente usando a Omie.
2. **Cada parte do portal fala com a Omie por conta própria.** São 40 arquivos que
   chamam a API direto, com pelo menos 6 clientes diferentes:

   | Cliente | Usado por | Comportamento no bloqueio |
   |---|---|---|
   | `lib/estoque/omie.ts` | syncs do estoque | **para** no bloqueio, freio de ~3 req/s, disjuntor por (conta, método) — o único certo |
   | `lib/ajustes/omie.ts` | ajustes, características, recebimentos | para no bloqueio, mas faz retry de rede; 2 s entre páginas |
   | `lib/dre-financeiro/omie-api.js` | DRE, contas a pagar/receber | **reenvia** em rate limit (até 5×) — prorroga o bloqueio |
   | `lib/pos/omie.ts` | POS, envio e faturamento de OS | espera 60 s e reenvia; reenvia "redundante" até 4× |
   | `lib/ppv/omie.ts` | PPV, faturamento de pedido | espera 60 s; pausa própria entre páginas |
   | `lib/omie-massa/omie.ts` | alteração em massa | pausa de 150 ms, sem disjuntor |
   | + ~20 rotas com `fetch` próprio | clientes, financeiro, mapa, webhook… | cada uma do seu jeito |

   A Omie limita 4 req/s e 240/min **por IP + chave + método** e **trava a chave por 30 min
   depois de 10 erros** (cada erro durante a trava prorroga). Todos esses clientes saem do
   mesmo IP do Railway com a mesma chave, sem saber uns dos outros. Os freios atuais são
   por processo e por cliente, não globais.
3. **Ninguém vê o que está acontecendo.** A tela `/agendamentos` lista 21 dos 52
   workflows do GitHub e 6 dos ~11 agendadores internos (2 deles errados: "Sync
   incremental" e "Backfill CMC" já foram para o GitHub). A "última execução" vem do
   GitHub, que só sabe se o portal **aceitou** a chamada — o resultado real está em
   `cron_runs` e a tela não lê.
4. **Reinício mata trabalho pela metade.** Os syncs longos não guardam onde pararam;
   depois de um deploy, recomeçam do zero no dia seguinte.

## 2. O que já existe e será reaproveitado

- `lib/estoque/omie.ts` — freio global (`OMIE_MIN_GAP_MS`), disjuntor por (conta, método)
  e `OmieBloqueioError`. É a base da porta única.
- `cron_runs` + `lib/cron/observar.ts` (`comCronRun`) — log de cada rodada com trava.
- `ajustes_jobs` + `lib/ajustes/jobs.ts` — estado de jobs longos com etapa/progresso e
  detecção de job morto (`jobEstaVivo`, 20 min sem atualizar).
- `src/instrumentation.ts` — já roda ~11 agendadores internos em produção (alocação,
  cache de notas, frota, pasta do cliente, Tratorilson, vigias…), com interruptor por env.
- `lib/agendamentos/registry.ts` + `/agendamentos` — o catálogo e a tela, que serão
  substituídos pela tabela nova.

## 3. Como vai funcionar

### 3.1 Porta única da Omie (`src/lib/omie/porta.ts`)

Toda chamada à Omie passa por `omie(conta, endpoint, call, params, opcoes)`.

- **Freio por (conta, método)** respeitando 4 req/s e 240/min, com folga (alvo 3 req/s).
- **Disjuntor compartilhado:** a primeira resposta de bloqueio marca (conta, método) como
  bloqueado até a hora informada; as próximas chamadas falham na hora, sem tocar a Omie.
  Bloqueio da chave inteira ("chave inválida ou aplicativo suspenso") para a conta toda.
- **Sem reenvio às cegas.** Leitura pode repetir em falha de rede (no máximo 2×, e nunca
  em erro da Omie). **Gravação nunca repete** sozinha: timeout em gravação devolve o estado
  `desconhecido` e quem chamou decide (é a regra que o faturamento de OS já segue).
- **Prioridade** em cada chamada:
  - `pessoa` — alguém esperando na tela (faturar, PDF, consultar cliente, criar pedido).
  - `rapido` — agendadores curtos (alocação, cache de notas, pasta do cliente).
  - `pesado` — syncs longos e backfills.

  Quando há fila, a próxima vaga vai sempre para a prioridade mais alta. Um sync pesado
  cede a vaga entre uma página e outra; nunca segura a chave.
- **Contadores** em memória, gravados a cada minuto: chamadas por conta/método/prioridade,
  erros, bloqueios. Alimentam o painel "Omie agora".

O portal roda em **uma instância** no Railway, então a fila em memória basta para o
freio. Se um dia escalar para mais de uma, a vaga passa a ser controlada no banco (fora
deste plano; registrado como risco).

### 3.2 Agendador (`src/lib/agendador/`)

Um laço único em `instrumentation.ts` (só produção, `AGENDADOR=off` desliga) que a cada
30 s lê a tabela de agendamentos e dispara o que está na hora.

- **Tabela `agendamentos`:** chave, nome, módulo, tipo de horário (diário às HH:MM, a cada
  N min, dias da semana, janela de horário, mensal no dia D), prioridade, usa Omie (sim/não
  e quais contas), duração máxima, ligado/pausado, quem pausou e por quê.
- **"Já rodou nesta janela?"** é decidido pelo banco (`cron_runs`), não pela memória — um
  reinício não faz rodar duas vezes nem pular.
- **Pesados um de cada vez por conta.** Dois syncs pesados da NOVA nunca correm juntos;
  NOVA e CASTRO podem correr em paralelo (chaves diferentes).
- **Retomar de onde parou.** Os syncs longos gravam um ponto de retomada (conta + página)
  a cada página. Depois de um reinício, a rodada interrompida continua dali em vez de
  recomeçar ou esperar o dia seguinte.
- **Desligamento limpo:** no SIGTERM do deploy, para de pegar página nova, grava o ponto
  de retomada e marca a rodada como `interrompida` (não `erro`).
- **Omie bloqueada:** a rodada fica `aguardando_omie` e volta sozinha quando a trava vence.
  Não conta como falha.

### 3.3 Execuções manuais

Tudo entra na mesma fila e no mesmo histórico, sempre com o nome de quem disparou.

1. **Botões que já existem** ("Sincronizar agora", "Verificar agora", "Buscar documentos"…)
   passam a pedir a execução ao agendador. Se já está rodando, o botão mostra o progresso
   em vez de começar outra; se a Omie está bloqueada, mostra até quando e a execução fica
   na fila.
2. **Ações de pessoa** (faturar, PDF, consultar) não são agendamentos: passam pela porta
   única com prioridade `pessoa` e respondem na hora. Aparecem só como consumo no painel.
3. **Execução marcada para depois** (novo): na tela, "rodar uma vez hoje às 22h" ou
   "rodar quando a Omie da NOVA desbloquear". Substitui os workflows manuais de backfill
   (`estoque-backfill-historico`, `estoque-backfill-noturno`) e os scripts rodados à mão.

### 3.4 A tela `/agendamentos`

```
┌─ Omie agora ───────────────────────────────────────────────────────┐
│ NOVA   ● livre    38 chamadas/min (limite 240)   fila: 2           │
│ CASTRO ● BLOQUEADA até 14:32 (10 erros em ListarProdutos)  fila: 5 │
│ Agora: Características · NOVA · pág 21/65 ████████░░░░ 32%         │
│ Próximo: Cache de notas (10:40) · Alocação (10:40)                 │
└────────────────────────────────────────────────────────────────────┘

[ Hoje ]  [ Agendamentos ]  [ Histórico ]  [ Fila ]

HOJE — linha do tempo (00h ─────────────── 23h)
 Produtos                              ■ 20:00 ok 6min
 Características                         ■ 20:06 ok 7min
 Estoque                                   ■ 20:15 ⚠ parou pág 30 → retomou 20:26 ok
 Recebimentos    ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪ ▪   (15 min, 36 ok)
 Alocação        ││││││││││││││││││││││   (10 min, 72 ok)
 Backfill 2024                         □ marcado 22:00 (Henri)

AGENDAMENTOS
 Nome            Quando        Última         Próxima   Situação
 Características diário 20:06  ontem 20:13 ok hoje 20h ● ligado  [Rodar agora] [Pausar]
 Recebimentos    15 em 15 min  10:00 ok       10:15     ● ligado
 Vendas (resync) uma vez 22:00 —              hoje 22h  ◌ marcado [Cancelar]
 FIPE frota      mensal dia 5  05/10 ok       05/11     ○ pausado (José)

HISTÓRICO (clicar abre o detalhe)
 Características · 13/10 10:57 · ✗ interrompido (servidor reiniciou às 11:03)
   NOVA 65/65 páginas ✓ · CASTRO 25/56 · disparado por: agendador
```

- **Omie agora:** situação de cada chave, consumo do último minuto, fila por prioridade,
  o que está rodando e o que vem em seguida. Responde "por que está lento/travado?".
- **Hoje:** linha do tempo do dia; mostra onde houve falha e se dois pesados se encostaram.
- **Agendamentos:** a lista completa; mudar horário, pausar e "rodar agora" sem publicar
  código. Só Dev altera; os demais com acesso à tela só veem.
- **Histórico:** cada rodada com quem disparou, duração, páginas por conta, onde parou e
  o erro em português.
- **Fila:** o que está esperando vaga na Omie e por quê.

Avisos no sino, só para Devs, só para o que pede ação: falhou 2 vezes seguidas, Omie bloqueada há mais
de 30 min, agendamento passou da duração máxima, agendador parado.

### 3.5 GitHub vira vigia

Fica um workflow só, de hora em hora, que chama `GET /api/agendador/saude`. Se o
agendador não registrou batida nos últimos 10 min (ou a rota não responde), o workflow
falha e avisa por e-mail e no sino (a parte do sino roda no portal quando ele voltar).

Ficam também no GitHub: `release-registrar.yml` (é disparado por push, não por horário)
e os workflows antigos desligados (sem `schedule`, só `workflow_dispatch`) durante a
transição, como reserva manual.

## 4. Etapas

Cada etapa termina com o portal funcionando igual ou melhor, publicada e conferida em
produção antes da próxima.

### Etapa 0 — Levantamento (sem mudar comportamento)
- Inventário de **todas** as chamadas à Omie: arquivo, método, leitura ou gravação, quem
  dispara (pessoa, agendamento, webhook), conta.
- Classificar os 52 workflows: usa Omie ou não, duração real (de `cron_runs`), se pode
  retomar por página.
- Corrigir já o `registry.ts` (as 2 entradas erradas) — barato e evita confusão até a
  tela nova.
- **Entrega:** apêndice deste documento com a tabela completa.

### Etapa 1 — Porta única da Omie
- Criar `lib/omie/porta.ts` a partir de `lib/estoque/omie.ts` (freio, disjuntor,
  prioridade, contadores, regra de gravação sem reenvio). Testes com Omie simulada:
  bloqueio, chave inválida, rede caindo, gravação com timeout, prioridade furando a fila.
- Migrar os clientes nesta ordem (do menos para o mais arriscado):
  1. `estoque/omie.ts` (vira uma casca da porta);
  2. `ajustes/omie.ts`, `omie-massa/omie.ts`;
  3. `dre-financeiro/omie-api.js` (tirar o reenvio em rate limit);
  4. rotas com `fetch` próprio (clientes, financeiro, mapa, webhook…);
  5. **por último, com teste e acompanhamento:** `pos/omie.ts` e `ppv/omie.ts` (envio e
     faturamento — gravações reais na Omie).
- Uma regra de lint/teste que falha se surgir `app.omie.com.br/api` fora da porta.
- **Pronto quando:** nenhum arquivo fora de `lib/omie/` chama a Omie; o painel de
  consumo (mesmo que provisório) mostra as chamadas por prioridade.

### Etapa 2 — Agendador, tabela e tela
- Migration `sql/agendador.sql`: tabela `agendamentos`, colunas novas em `cron_runs`
  (disparado_por, quem, retomada, páginas, status `interrompida`/`aguardando_omie`),
  contadores de consumo da Omie por minuto. RLS só leitura; escrita pelas rotas.
- Laço do agendador em `instrumentation.ts`, batida de vida, desligamento limpo.
- Tela `/agendamentos` nova (Omie agora · Hoje · Agendamentos · Histórico · Fila) e
  rotas `/api/agendador/*` (listar, alterar, pausar, rodar agora, marcar para depois,
  saúde).
- Os agendadores internos que já existem em `instrumentation.ts` entram na tabela
  (passam a aparecer na tela e a ter histórico), sem mudar o ritmo deles.
- **Pronto quando:** a tela mostra todos os agendamentos internos com resultado real e
  "rodar agora" funciona para eles.

### Etapa 3 — Trazer os agendamentos do GitHub, um a um
Para cada workflow: cadastrar na tabela → rodar no portal em paralelo por 1–2 dias com o
GitHub virado em reserva (a rota do GitHub só executa se o portal não tiver rodado bem na
janela) → conferir → tirar o `schedule` do workflow.

Ordem proposta:
1. **Características** (o caso que motivou) — já com retomada por página.
2. Os que não usam a Omie (reuniões, tickets, avisos, carrinhos, POPs, e-mails, frota sem
   Omie…) — baixo risco, ganham pontualidade.
3. Os pesados da noite (a partir das 20:00), com horários escalonados: produtos → características →
   estoque → movimentos → compras → backfill CMC.
4. Os do dia: recebimentos, incremental, notas, DRE, pasta do cliente, NFs.
5. Os de envio de e-mail e relatórios semanais.

Os botões manuais de cada tela passam a usar o agendador quando o agendamento
correspondente for migrado.

### Etapa 4 — GitHub vira vigia
- Workflow único de saúde; desligar o `schedule` dos que restarem.
- 30 dias depois de cada migração, apagar o workflow antigo (decisão 5).
- Remover `lib/agendamentos/registry.ts` (a tabela é a fonte da verdade).
- Atualizar `CLAUDE.md` e `docs/crons-portal-nova-tratores.md`.

## 5. Riscos e cuidados

| Risco | Cuidado |
|---|---|
| Mexer no envio/faturamento de OS e PPV | Migrados por último, com teste de Omie simulada e primeira operação real acompanhada |
| Fila em memória perde o que estava esperando num reinício | Só as chamadas de pessoa ficam em memória (a pessoa vê erro e tenta de novo); agendamentos têm estado no banco e retomam |
| Agendador parado sem ninguém ver | Batida de vida + vigia no GitHub + aviso no sino |
| Tudo no mesmo horário trava a Omie | Pesados um por conta, horários escalonados na tabela, freio global |
| Mais de uma instância no Railway duplicaria agendamentos | Manter 1 instância (já é a regra); trava por agendamento no banco como segunda proteção |
| Agendamento novo esquecido fora da tabela | Teste que falha se houver `setInterval` novo em `instrumentation.ts` ou workflow com `schedule` fora da lista permitida |
| Deploy no meio de sync longo | Desligamento limpo + retomada por página |

## 6. Decisões (respondidas em 13/10/2026)

1. **Syncs pesados começam às 20:00**, escalonados um por conta (produtos → características
   → estoque → movimentos → compras → backfill CMC), terminando bem antes da manhã.
   Quem chega às 7:30 encontra tudo em dia. Se um deploy à noite interromper, a rodada
   retoma pela página onde parou.
2. **Pausar/alterar agendamento: só Dev** (`is_dev`). Os demais com acesso à tela só veem.
3. **Avisos de falha e de bloqueio: só Devs** (sino).
4. **Recebimentos a cada 15 min** em horário comercial. Como o sync completo leva ~20 min,
   o de 15 em 15 é o **recente** (`sincronizarRecebimentosRecentes`, notas emitidas nos
   últimos 45 dias, ~30 s) — o mesmo da alocação de peças, que passa a ser um agendamento
   só com ele. O **completo** roda uma vez por noite junto dos pesados.
5. **Reserva do GitHub: 30 dias.** Depois que um agendamento é migrado, o workflow antigo
   fica sem `schedule` (só botão manual) por 30 dias e então é apagado.

## 7. Fora deste plano

- Duas ou mais instâncias do portal (fila no banco em vez de memória).
- Cursores incrementais nos syncs que hoje puxam tudo (produtos, recebimentos) — fica mais
  fácil depois da porta única, mas é trabalho à parte.
- Webhooks da Omie substituindo syncs.

---

## Apêndice A — Levantamento da Etapa 0 (13/10/2026)

Feito por leitura do código (imports seguidos a partir de cada rota) e pelos registros de
`cron_runs`. Nenhum comportamento mudou; só a lista da tela `/agendamentos`
(`lib/agendamentos/registry.ts`) foi corrigida: saíram "Sync incremental" e "Backfill CMC"
como internos (rodam só pelo GitHub) e entraram os 7 agendadores internos que faltavam.

### A.1 Quem fala com a Omie

**40 arquivos** fazem a chamada HTTP à Omie diretamente (têm a URL `app.omie.com.br/api`);
outros ~20 chamam por meio deles. Os 6 clientes compartilhados (`estoque/omie.ts`,
`ajustes/omie.ts`, `dre-financeiro/omie-api.js`, `pos/omie.ts`, `ppv/omie.ts`,
`omie-massa/omie.ts`) concentram a maior parte; o resto são rotas e libs com `fetch` próprio.

**15 arquivos GRAVAM na Omie** — são os que exigem a regra "gravação nunca repete":

| Arquivo | Métodos que gravam | Quem dispara |
|---|---|---|
| `lib/ppv/omie.ts` | IncluirPedido, AlterarPedidoVenda, FaturarPedidoVenda, CancelarPedidoVenda, IncluirRemessa | pessoa (PPV) |
| `lib/pos/omie.ts` | IncluirOS, AlterarOS | pessoa (enviar OS) |
| `lib/pos/faturamento.ts` | AlterarOS, FaturarOS | pessoa (faturar OS) |
| `lib/garantias/omie-faturamento.ts` | AlterarOS | pessoa (garantias) |
| `lib/ajustes/omie.ts` | Incluir/AlterarCaractProduto, Alterar/Concluir/ReverterRecebimento, AlterarEtapaRecebimento, Incluir/ExcluirAjusteEstoque, AlterarPedidoVenda, ExcluirPedido, AlterarContaPagar/Receber, LancarPagamento/Recebimento | pessoa (telas de Ajustes) e robôs (classificar recebidos, abate de peças) |
| `lib/estoque/recebimentos.ts` | AlterarProduto, Alterar/Concluir/ReverterRecebimento | pessoa (dar entrada) |
| `lib/financeiro/omie-contapagar.ts` | IncluirContaPagar, IncluirCliente, IncluirAnexo | pessoa (financeiro) |
| `lib/ajustes/remessas.ts` | DevolverRemessa | pessoa |
| `lib/ajustes/descricoes.ts`, `lib/ajustes/familias.ts` | AlterarProduto | pessoa |
| `app/api/omie-massa/produtos`, `/servicos` | AlterarProduto, AlterarCadastroServico | pessoa (alteração em massa) |
| `app/api/clientes/criar`, `/projetos/criar` | IncluirCliente, IncluirProjeto | pessoa |
| `app/api/feedbacks/cliente-omie` | AlterarCliente, Incluir/ExcluirTags | pessoa |

Todos os outros só leem (Listar*, Consultar*, Obter*, Status*, GetUrlDanfe).

### A.2 Agendamentos do GitHub (52)

**25 chegam à Omie** (pelo grafo de imports; `dre-financeiro-relatorio-lista` e
`war-room-snapshot` importam o cliente mas talvez nem chamem — conferir na Etapa 3):

| Workflow | Horário hoje (BRT nominal) | Cliente usado | Duração real (7 dias) |
|---|---|---|---|
| estoque-sync-produtos | 02:00 | estoque | mediana 6 min, máx 17 |
| estoque-sync-movimentos | 02:20 | estoque | 4 min |
| estoque-backfill-cmc | 02:45 | estoque + ajustes | **45 min — 4 de 7 ficaram "rodando" (mortas por deploy)** |
| ajustes-sync-caracteristicas | 03:00 | ajustes | 7 min — **3 erros, 2 interrompidas, 2 ok** |
| ajustes-scan-negativos | 01:00 | ajustes | sem registro em cron_runs |
| estoque-sync-compras | 03:30 | estoque | 4 min |
| estoque-backfill-os-servicos | 03:30 | estoque | sem registro |
| estoque-snapshot-sugestao-compra | 03:30 | estoque | sem registro |
| ajustes-prewarm-recebimentos | 04:00 | ajustes | sem registro |
| estoque-enriquecer-notas | 04:30 | estoque + ajustes | sem registro |
| estoque-sync-remessas | 04:15 e 13:15 | estoque + ajustes | sem registro |
| ajustes-classificar-recebidos | 05:00 e 10:00 | ajustes | sem registro |
| clientes-sync-omie | 05:30 | rota própria + nfse | cron_runs `clientes-sync-omie` (fire-and-forget desde 14/10) |
| pos-sync-omie | 05:10 | pos/sync-omie | sem registro |
| sync-nfs | 05:00, 12:00, 17:00 | rota própria + nfse | sem registro |
| estoque-sync-estoque | a cada 3 h | estoque | 4 min, máx 13 |
| dre-financeiro-sync | a cada 3 h | dre | sem registro |
| ajustes-sync-notas | a cada 3 h | ajustes | 15 s |
| estoque-sync-incremental | 2×/h, 06–20h | estoque | 20 s |
| estoque-sync-recebimentos | 15 min, 06–19h | estoque/recebimentos | **12 min, máx 19 — não cabe em 15 min** |
| pecas-abate | 30 min | ajustes | sem registro |
| estoque-backfill-historico / -noturno | manual | estoque | — |
| dre-financeiro-relatorio-lista, war-room-snapshot | semanais | dre / estoque | sem registro |

**27 não usam a Omie** (só banco, e-mail ou outros serviços): avisos-publicar,
carrinhos-auto-fechar, clientes-relatorio-semanal, estoque-sync-selic,
feedbacks-oportunidades-recomputar, financeiro-emails, frota-atualizar-fipe,
frota-fechar-dia, frota-ocorrencias-auto, frota-sync-cadastro, frota-sync-eventos,
garantias-claims-perdidos, garantias-devolucoes, garantias-emails,
marketing-apoios-vencendo, pops-recorrencias, pos-auto-fase, pos-separar-pecas,
pos-vigia-revisoes, ppv-relatorio-lista, release-registrar (fica no GitHub),
reunioes-corte-pauta, reunioes-gerar-instancias, reunioes-lembrete-ata,
supervisor-salvar-rotas, sync-rotas-comercial, tickets-auto-fechar.

### A.3 Agendadores internos (Railway, `instrumentation.ts`)

| Agendador | Ritmo | Omie? | Duração |
|---|---|---|---|
| Pasta cliente (sync-recente) | 5 min | **sim** (ListarOS/ListarPedidos/Status*) — o consumidor mais frequente | sem registro |
| Alocação de peças (recebimentos recentes) | 10 min, seg–sáb 07–20h | sim | 20 s |
| Cache de notas fiscais | 10 min | sim (DfeDocs, GetUrlDanfe, NFS-e) | 6 min |
| Tratorilson (OS em Relatório Concluído) | 10 min | sim (pos, ppv, garantias, financeiro) | sem registro |
| Faturamento de OS — conferência | 10 min | sim, só com OS pendente | sem registro |
| Scanner financeiro | 5 min | sim — **desligado** (só com SYNC_FINANCEIRO_AUTO=on) | — |
| Pendências da frota | 15 min | não | 2 s |
| Vigia de conversas NovaZap | 5 min | não | — |
| Vigia de saúde dos robôs | 1 h | não | — |
| Replanejamento dos cronogramas | diário 06:00 | não | — |
| Monitor de uso | 1 min | não | — |

### A.4 O que o levantamento mostrou

1. **Nenhum bloqueio 425 nos últimos 30 dias.** O freio do cliente do estoque (09/2026)
   resolveu o que motivava a reforma anterior. As falhas recentes foram de **chave
   recusada** (NOVA, 10 a 12/10), que a porta única deve tratar como "conta parada" e
   não como erro de cada sync.
2. **Deploy é o maior inimigo hoje:** backfill CMC (45 min) morreu 4 vezes em 7 dias e
   características 2 vezes, sempre por reinício no horário comercial. Rodar às 20:00 com
   retomada por página resolve os dois.
3. **A noite cabe com folga:** somando os pesados no pior caso (produtos 17 + movimentos 4
   + características 7 + estoque 13 + compras 5 + backfill CMC 46 + recebimentos completo
   19 ≈ 1h50), começando às 20:00 tudo termina antes das 22:00, mesmo em fila por conta.
4. **Só 13 agendamentos registram em `cron_runs`.** Os outros ~45 não deixam rastro de
   resultado — a Etapa 2 resolve isso para todos, porque o agendador é quem registra.
5. **A pasta do cliente é o maior consumidor contínuo** (a cada 5 min, o dia todo). É a
   primeira candidata a medir na porta única (Etapa 1) e talvez a espaçar.
6. **Ordem de migração da Etapa 1 confirmada:** os 6 clientes compartilhados cobrem a
   maior parte; as gravações (A.1) ficam por último.
