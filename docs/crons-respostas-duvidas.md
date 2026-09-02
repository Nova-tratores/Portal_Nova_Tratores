# Respostas às dúvidas sobre os crons/syncs (com evidência no código)

> Investigado direto no código do portal. Foco nas dúvidas **2, 4 e 5** (as que travam o diagnóstico),
> mais respostas rápidas para 1, 6, 7 e 10.

## Dúvida 1 — Qual IP a Omie enxerga?
**Confirmado: é o IP de egress do Railway (o servidor do portal), não o do runner do GitHub.**
O GitHub Actions só faz `curl` para uma rota `/api/.../cron/...`; **quem chama a Omie é o servidor do
portal**. Logo o rate limit por IP é do Railway, **compartilhado por todos os crons e pelas ações
manuais do portal**. O IP do runner é irrelevante.

## Dúvida 2 — O curl espera o job ou a rota responde 202 e trabalha em background?
**Depende da rota — e a maioria das pesadas é FIRE-AND-FORGET no servidor.** Ou seja, a preocupação de
"30h de runner/dia" **não se aplica**: o runner volta em segundos nas assíncronas; e mesmo nas síncronas
o `curl` tem `--max-time` (≈600s nas que checei) — o trabalho continua no **servidor Railway** (instância
de longa duração), não no runner. Então **não estoura cota do Actions**.

| Rota | Padrão | maxDuration |
|---|---|---|
| sync-produtos, sync-estoque, sync-compras | **Fire-and-forget** (200 "iniciado", sem await) | 300s |
| sync-recebimentos | **Fire-and-forget** (202 background) | — |
| movimentos/cron | **Background por padrão** (síncrono só com `?wait=1`) | 800s |
| ajustes/estoque-negativo/iniciar (scan-negativos) | **Background** (202, worker) | 60s |
| ajustes/classificar-recebidos | **Background por padrão** (síncrono com `?sync=1`) | 300s |
| **sync-incremental** | **SÍNCRONO** (await) | 300s |
| **ajustes/sync-notas** | **SÍNCRONO** (await) | 800s |
| **clientes/sync-recente (sync-nfs)** | **SÍNCRONO** (await de tudo; job de 120min) | — |
| backfill-os-servicos/status | só **lê** progresso em memória (não dispara nada) | — |

🚨 **Efeito colateral crítico:** como as pesadas rodam **em background no servidor** e **não há trava de
concorrência**, vários jobs podem estar **batendo na Omie ao mesmo tempo** na mesma instância. Combinado
com a dúvida 5, é a "fábrica de 425".

## Dúvida 4 — Os syncs usam marca-d'água/cursor ou puxam tudo?
**Quase nenhum usa cursor de verdade → a frequência É o custo** (exatamente a hipótese da outra IA).

| Sync | Incremental? | Como |
|---|---|---|
| **produtos / estoque rápido** | ❌ **puxa TUDO** | `ListarProdutos`/`ListarPosEstoque` sem `filtrar_por_data`/`alteracao`; só upsert idempotente |
| **recebimentos** (a cada 15min!) | ❌ **puxa TUDO** | varre todas as páginas desde o começo toda rodada (`ListarRecebimentos`, teto 200 págs) |
| **vendas (incremental do cron)** | ❌ **re-puxa o mês inteiro** | `buscarESalvarItensOmie` faz delete+reinsert do mês. Existe cursor (`cache_controle.ultima_data`) mas **só a UI usa**; o cron não. |
| **compras / notas entrada** | 🟡 **janela de meses** | reprocessa os últimos ~3 meses inteiros; filtra por EMISSÃO, não por alteração |
| **movimentos (livro-razão)** | ✅ **cursor real** | `estoque_movimentos_sync.sincronizado_em` (round-robin: mais desatualizados primeiro, resumível) |

Nenhum usa `filtrar_apenas_alteracao`/`dAltDe`. → **recebimentos a cada 15 min** e **incremental a cada
30 min** re-varrem tudo → caras e desnecessariamente frequentes.

## Dúvida 5 — Como o cliente Omie trata erro e 425 hoje? (a mais importante)
**Existem DOIS clientes Omie, com comportamentos OPOSTOS no 425:**

- **`src/lib/ajustes/omie.ts`** → no "API bloqueada/consumo indevido" **ABORTA na hora** (lança erro com
  `bloqueio:true`, **não retenta**). Correto — não piora. (Retenta só rede e transitórios tipo "too many
  requests"/SOAP.)
- **`src/lib/estoque/omie.ts`** → no MESMO bloqueio **DORME o tempo indicado e REENVIA** (`continue` no
  loop, `retries` 1–3). **É este que TODOS os syncs de estoque usam.** → **prorroga o bloqueio** (cada
  chamada durante o 425 pode reiniciar a janela). **É o "bloqueio sem motivo aparente".**

**Não há rate limiter global / token bucket / fila / trava de vazão** entre chamadas Omie. Só:
- `sleep` fixos hard-coded por arquivo (1200ms produtos, 900ms movimentos, 500ms vendas, 2000–3000ms
  compras/páginas);
- uma **trava booleana em memória** só no sync de produtos (anti-concorrência, por instância);
- serialização **por conta** (NOVA/CASTRO em paralelo — ok, ver dúvida 7).

→ Confirmado: hoje o sistema **retenta dentro do 425** (estoque) e **não coordena vazão** → rajadas
concorrentes na mesma chave são possíveis. A recomendação #2 da outra IA (cliente único + rate limiter +
circuit breaker que PARA no 425) ataca exatamente a causa raiz.

## Dúvida 6 — Existe trava de execução (evitar sobreposição)?
**Quase não.** Só o sync de **produtos** tem `let syncEmAndamento` (booleano em memória, por instância).
**Recebimentos** (roda a cada 15min e a versão UI pode durar ~15min) **não tem trava → pode se sobrepor**.
Não há tabela `cron_runs`/lock no banco. (Recomendação #3 da outra IA é válida e falta mesmo.)

## Dúvida 7 — "4 simultâneas" é por AppKey ou por IP?
A doc oficial da Omie diz: limite por **IP + App Key + Método (distintos)**. Como **NOVA e CASTRO são
App Keys diferentes**, **paralelizar as duas contas é seguro** (chaves distintas) — o código já faz isso.
O que NÃO pode é paralelizar **o mesmo método na mesma conta** além de 4 em voo.

## Dúvida 10 — Há dependência de ordem violada?
**Sim, pelo menos uma:** `sync-compras` e `snapshot-sugestao-compra` disparam **no mesmo minuto (03:30
BRT)** — a sugestão pode congelar dados de compras de ontem. CMC (02:45) depende de produtos (02:00) +
movimentos (02:20): a ordem no relógio está ok, mas nada garante que os jobs **fire-and-forget**
terminaram antes (não há `needs:`/encadeamento). Encadear (recomendação #1) resolve.

## Dúvida 3 — "Peso (40min)" é duração real ou timeout?
**Era o `timeout-minutes` configurado, NÃO duração medida.** Medi a duração REAL na API do GitHub
Actions (últimas 5 execuções de cada):

| Workflow | Duração real (runner) | Observação |
|---|---|---|
| sync-produtos | **~6s** | fire-and-forget: o runner volta na hora; o trabalho real roda no Railway |
| sync-recebimentos | ~6s | idem (202) |
| sync-incremental | ~15s | síncrono, mas leve |
| backfill-cmc | ~6s | fire-and-forget |
| sync-movimentos | ~6s | background |
| classificar-recebidos | ~6s | fire-and-forget |
| os-servicos (/status) | ~1min | só lê progresso |
| **sync-nfs** | **~10min** | síncrono de verdade (o único pesado no runner) |

**Conclusões:** (a) o custo de RUNNER é irrisório (~30min/dia no total, quase tudo `sync-nfs`) → a
preocupação de "30h/dia + cota do Actions" **não procede**. (b) MAS a duração **no SERVIDOR** dos jobs
fire-and-forget é **desconhecida** (o runner volta em 6s sem esperar) → **falta observabilidade**
(recomendação #3, `cron_runs`) para saber quanto cada um roda de fato e propor janelas com precisão em
vez de chute. Hoje só dá pra afirmar que **vários rodam concorrentes no servidor** sem trava.

## Dúvida 8 — sync-nfs 3×/dia com 120min, inclusive 12:00?
Duração real ~**10min** (o 120 é só o teto). É **síncrono** e usa **janela "de hoje"** (`ListarOS`/
`ListarPedidos` com `filtrar_por_data` + `filtrar_apenas_inclusao:'N'` = traz também os alterados no dia)
e baixa as NFs. Não é full re-pull, mas os 3× (05/12/17h BRT) — o do **meio-dia** compete com o pico
comercial. Dá pra reduzir para **1–2× (fim da cadeia noturna + 1 no início da tarde)** sem perder muito.

## Dúvida 9 — sync-notas e sync-incremental são a mesma coisa?
**NÃO são redundantes.**
- **sync-incremental** = **pedidos de venda + OS** do mês (objeto "pedido" → `vendas_itens`), para o
  dashboard de estoque.
- **sync-notas** (`cronSyncNotasSaida`) = **notas fiscais de saída (NF-e/NFS-e)** → tabela
  `portal_nt_notas_saida`, e **TEM watermark próprio** (`portal_nt_notas_saida_sync`, onConflict
  `conta_omie`) → é incremental de verdade.
Pedido ≠ nota fiscal (um vira o outro depois). Objetos, tabelas e propósitos diferentes. (E, corrigindo:
o **sync-notas SIM usa cursor**, ao contrário dos syncs de estoque.) `sync-estoque` (saldo) vs
`incremental` (pedidos) também não são redundantes, como a outra IA supôs.

---

## Resumo para fechar a proposta de horários
- **Custo real de runner é baixo** (fire-and-forget/curl com timeout) — o problema NÃO é cota do Actions.
- **Causa raiz dos 425:** (a) cliente de estoque **retenta dentro do bloqueio**; (b) **sem trava** →
  jobs concorrentes na mesma chave; (c) **sem cursor** nos frequentes → cada rodada re-varre tudo,
  inflando o volume; (d) **cluster 03:10–03:55** com até 6 jobs Omie simultâneos > limite de 4.
- **Ordem de prioridade das correções (bate com a outra IA):** #2 (cliente único + rate limiter +
  circuit breaker que ABORTA no 425 — copiar o comportamento do `ajustes/omie.ts` para o de estoque) >
  #3 (trava por job) > #1 (encadear a madrugada) > #4 (afrouxar frequência + cursores) > horários.
- Com o rate limiter + abort-no-425, a **janela de manutenção 22:00–01:00** vira "bônus", não
  obrigatória — a escrita dos ~4.000 "Tipo:" a ~2 req/s (~35 min) fica segura mesmo de dia.

**Pode fechar a tabela de horários proposta** — as dúvidas 2, 4 e 5 estão respondidas acima.
