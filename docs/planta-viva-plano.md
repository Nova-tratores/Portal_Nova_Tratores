# Planta Viva — plano técnico da v1 (MVP)

> Planejamento das 200 sugestões (10 agentes): https://claude.ai/artifact/CBp8NuHdjHU4ADaxkScLrw
> Decisões do usuário em 19/10/2026 estão na seção 1. Nada desta tela existe no código ainda.

## 0. O que é

Uma tela `/planta` que desenha a empresa vista de cima: cada setor é um cômodo, cada fluxo
é um cano (dinheiro = água, máquinas = gás, pedidos/peças = luz). Cada cômodo mostra o seu
número principal, a idade do dado e abre a lista dos registros que formam o número, com link
para a tela oficial. A planta **não grava nada**: é um mapa por cima das telas que já existem.

## 1. Decisões (19/10/2026)

| Tema | Decisão |
|---|---|
| Contas a pagar | **As duas tabelas.** `contas_pagar` (espelho Omie, 1.094 títulos abertos) = cano de saída: vencidos, hoje, 7 dias. `finan_pagar` (pedidos de pagamento do portal, 80 desde 02/2026) = fila "esperando o financeiro". |
| Saldo bancário | **Não existe.** A caixa d'água mostra o saldo líquido projetado (a receber − a pagar, acumulado dia a dia, partindo de zero) e a cobertura em dias. |
| Quem vê o financeiro | **Só admin** (`isAdmin`, que inclui Dev). Corte feito na rota do servidor. Os demais veem os canos de dinheiro lacrados, sem R$ e sem drill-down. |
| Metas e limiares | **A definir.** Até lá, nenhum cômodo muda de cor por limiar; só o selo de frescor tem cor. |
| Máquinas vindo | **As duas fontes.** Trecho longo = `Proposta_Fabrica` (pedido à fábrica, com `eta_fabrica`). Trecho final = `recebimentos_nfe` com `status='Faturada'` e `qtd_maquinas>0`, emitida há ≤ 45 dias. Mais de 45 dias = alerta "recebimento esquecido". |

Pré-requisitos já feitos: `eta_fabrica` com tela (c3f05171) e máquina reconhecida pelo NCM no
espelho dos recebimentos + backfill de 1.153 NFs (9813f0f4, 19/10 15:12).

## 2. Cômodos e números da v1

Cada número tem um `kpi_id` estável. "Sensível" = só admin vê o valor.

### Financeiro (sensível)

| kpi_id | O que mede | Fonte e filtro | Job de origem (frescor) |
|---|---|---|---|
| `pagar_vencido` | soma e contagem em atraso | `contas_pagar`, `status_titulo='ATRASADO'`, por `conta_omie` | `dre-financeiro-sync` |
| `pagar_hoje` | vence hoje | `contas_pagar` em aberto com `data_previsao = hoje` (bate com o card da Omie) | idem |
| `pagar_7d` | vence em 7 dias | `contas_pagar` em aberto, `data_previsao` entre amanhã e +7 | idem |
| `receber_vencido` | soma, contagem e aging 1–30 / 31–90 / 90+ | `contas_receber`, `status_titulo='ATRASADO'` | idem |
| `receber_hoje`, `receber_7d` | idem pagar | `contas_receber` | idem |
| `fluxo_30d` | série de 30 dias do acumulado (receber − pagar) e o 1º dia negativo | `contas_pagar` + `contas_receber` em aberto por `data_previsao` | idem |
| `fila_financeiro` | pedidos esperando o financeiro (contagem, soma, mais antigo) | `finan_pagar` com `status='financeiro'`; separa `aguardando_omie_desde` e `status_envio='erro'` | nativo (portal grava na hora) |

"Em aberto" segue o mesmo critério do `calc.js` do DRE (não PAGO/RECEBIDO/CANCELADO). A
lógica de filtro é **reaproveitada**, não reescrita: extrair para `lib/planta/fontes/financeiro.ts`
o que `/api/dre-financeiro/vencidos` e `saldo-projetado` já fazem, e conferir os dois lado a lado.

### Estrada e pátio (máquinas)

| kpi_id | O que mede | Fonte |
|---|---|---|
| `maq_pedido_fabrica` | pedidos em aberto até a máquina chegar; quantos com `dias_atraso_eta > 0` | `v_proposta_fabrica`, fases antes de "Proposta Concluida/ Maquina Recebida" |
| `maq_em_transito` | NF de máquina faturada e não recebida, ≤ 45 dias | `recebimentos_nfe`: `status='Faturada'`, `qtd_maquinas>0`, emissão ≤ 45 d |
| `maq_receb_esquecido` | a mesma regra com emissão > 45 d (hoje: 15 NFs, 2021→2026) | idem |
| `maq_recebida_sem_faturar` | máquina recebida sem faturar ao cliente | `v_proposta_fabrica` na fase "Proposta Concluida/ Maquina Recebida" ou "Aguardando faturamento da fábrica" |

⚠️ `emissao_nfe` está gravada em **dois formatos** (`DD/MM/AAAA` nas linhas antigas e ISO nas
novas): filtrar por data no SQL exige normalizar (`to_date` condicional) ou corrigir a coluna antes.
O pátio (máquinas em estoque e idade) fica para a F2: falta uma data de entrada confiável por chassi.

### Balcão de peças

| kpi_id | Fonte |
|---|---|
| `ppv_aberto` | `pedidos` (PPV) fora das fases finais, por idade de `status_desde` (0–2 / 3–7 / > 7 d); fases do `lib/ppv/relacao.ts` |

### Oficina

| kpi_id | Fonte |
|---|---|
| `os_por_fase` | `Ordem_Servico` agrupada pelas fases do POS (`lib/pos/relacao.ts` → `FASES_OS`) |
| `os_atrasada` | OS pendente com previsão de execução/faturamento vencida |
| `os_sem_faturar` | OS com serviço concluído nas fases Executada → Cobrando Cliente; valor = `valorOS()` (sensível) |

### Almoxarifado

| kpi_id | Fonte |
|---|---|
| `pecas_a_alocar` | `pecas_alocacao_pendencias` com `status='aberta'` |
| `estoque_negativo` | `produtos` com `estoque < 0`, por `conta_omie` (minúscula nessa tabela) |

### Sala de máquinas

| kpi_id | Fonte |
|---|---|
| `robos` | última rodada de cada job de origem em `cron_runs` (status, fim, bloqueio 425) |

## 3. Arquitetura

> **Mudança no Gate 1 (19/10/2026):** o cálculo ficou em **TypeScript no worker**
> (`src/lib/planta/regras.ts` puro + `server.ts`), não numa RPC SQL — assim ele usa as MESMAS
> regras das telas (`STATUS_ABERTO_PPV`, `PHASES`, `valorOS`, filtro de vencidos) em vez de
> reescrevê-las em SQL, e a conferência bateu 0,000%. Ritmo: **5 min** (o espelho do financeiro
> muda a cada poucas horas). Leitura paginada com `.order()`; uma escrita (upsert) por rodada.
> Os itens 3.1 (RPC) e 3.2 abaixo ficam como registro do desenho original.

```
worker (agendador) ── a cada 5 min ──► src/lib/planta (TS, só leitura) ──► tabela planta_kpi (43 linhas)
                                                                         │
navegador ── GET /api/planta (60 s + ao voltar à aba) ◄── site lê ◄──────┘
          └─ GET /api/planta/kpi/[id] (drill-down, sob demanda, direto das fontes)
```

**Por que tabela e não cache em memória:** desde 16/10 os robôs rodam num serviço separado
(`PAPEL=worker`). O site e o worker não dividem memória.

### 3.1 Banco — `sql/planta-viva.sql` (migration nova)

- `planta_kpi`: `kpi_id text`, `conta text` (`NOVA` | `CASTRO` | `TODAS`), PK `(kpi_id, conta)`;
  `comodo text`, `valor numeric`, `contagem int`, `detalhe jsonb` (pequeno: aging, série de 30 dias,
  contagem por fase), `sensivel bool`, `fonte_job text`, `dado_ate timestamptz`, `calculado_em timestamptz`, `erro text`.
- RLS ligada **sem policy** + `REVOKE` de anon/authenticated (só service role, como `mkt_*` e `kb_*`).
  Isto não é detalhe: muitas tabelas-fonte estão abertas à anon key, e a planta não pode virar mais uma porta.
- `planta_calcular()` `SECURITY DEFINER`, executável só pela service role: calcula **tudo com SUM/COUNT
  no Postgres** (nunca no Node: o PostgREST corta em 1.000 linhas, caso do Sankey) e faz um único upsert.
  Um bloco por KPI dentro de `BEGIN … EXCEPTION`: KPI que falha grava `erro` e não derruba os outros.
- Sem `planta_kpi_hist` na v1 (histórico/replay = F2).

### 3.2 Agregador

- Tarefa `planta-snapshot` em `src/lib/agendador/tarefas.ts`, a cada 2 min, chamando a RPC.
  Interruptor `PLANTA=off`. Fallback com `setInterval` no `instrumentation.ts` só quando o agendador
  está desligado, no mesmo padrão dos outros jobs.
- **Zero chamada à Omie.** Teste que falha se algum arquivo de `src/lib/planta/` importar `lib/omie`.
- `dado_ate` de cada KPI = fim da última rodada OK do `fonte_job` em `cron_runs`
  (KPI nativo do portal = `now()`).

### 3.3 Rotas

- `GET /api/planta?conta=NOVA|CASTRO|TODAS`: `protegerRota` com o módulo novo `planta`. Lê `planta_kpi`.
  Se não é admin, KPI `sensivel` volta com `valor: null` e `detalhe` sem R$ (mantém só contagens).
  Resposta já com `frescor` calculado (`verde` < 30 min, `amarelo` < 4 h, `vermelho` acima;
  KPI com `erro` = "em obras").
- `GET /api/planta/kpi/[id]?conta=`: drill-down, até 200 registros (id, descrição, valor, data e
  link para a tela oficial), lido direto das fontes com paginação e `.order('id')`. KPI sensível
  sem admin = 403. Fica no `audit_log` (sistema `planta`, ação `drill`).
- Os links de destino vêm das telas que existem (`/dre-financeiro/...`, `/financeiro/home-financeiro`,
  `/propostas`, `/estoque/recebimentos-omie`, `/ppv?id=`, `/pos?id=`, `/ajustes/caracteristicas?alocar=1`).

### 3.4 Tela `/planta`

- `src/app/(portal)/planta/page.tsx` + `src/components/planta/*`.
- **SVG + React**, sem biblioteca nova. Layout fixo em `src/lib/planta/layout.ts`
  (cômodos com posição/tamanho, canos com `de → para` e `kpi_id`). Layout editável em JSON = F2.
- Camadas liga/desliga (Dinheiro · Máquinas · Pedidos · Pessoas), tooltip, inspetor lateral
  (número, frescor, detalhe, lista do drill-down, botão "Abrir no portal").
- Seletor NOVA · CASTRO · Todas (cookie `conta`, como o DRE).
- Animação dos canos só com `prefers-reduced-motion: no-preference`; o cano fica parado com hachura
  quando o dado está amarelo/vermelho (espelho velho não pode parecer "ao vivo").
- **Modo escuro:** cores só por classe + variáveis CSS. As regras do `globals.css` remapeiam
  `style=` inline, e o neon viraria outra cor.
- Celular: grade de cartões por cômodo (sem pan/zoom).
- Atualiza com polling de 60 s + `useRefreshOnFocus`. Realtime (broadcast "atualizou") = F2.

### 3.5 Registro no portal

`lib/permissoes/catalogo.ts` (módulo `planta`), `admin/page.tsx`, `navItems`, card no dashboard
**com entrada em `systemToModulo`** (card sem entrada aparece para todo mundo), `AJUDA['/planta']`.
No dia do lançamento: dar o módulo às pessoas certas e conferir em "Quem acessa" (lição do War Room).

## 4. Testes e conferência

- Vitest em `src/lib/planta/__tests__/`: aging, janela de 45 dias, frescor por idade,
  limpeza dos sensíveis para não-admin, contrato do layout (todo `kpi_id` do layout existe no catálogo).
- `scripts/planta-conferir.ts`: compara cada KPI do snapshot com o número da tela oficial
  (`/api/dre-financeiro/vencidos`, a contagem do Kanban do Financeiro, `/propostas`, `/estoque/recebimentos-omie`,
  `/pos`, `/ppv`) e imprime a divergência. **Portão da v1: divergência ≤ 0,5% por 1 semana.**

## 5. Ordem de execução (com portão)

1. **Gate 0 — fontes:** script só de leitura que imprime todos os KPIs calculados das fontes
   (sem tabela e sem tela) para NOVA e CASTRO, e confere contra as telas oficiais. Decidir aqui os
   textos exatos de fase/status. **Ok do usuário antes de seguir.**
2. **Gate 1 — banco + agregador:** migration, RPC, tarefa no agendador, rota `/api/planta` e testes.
   Rodar 24 h em produção sem tela, olhando `cron_runs` e a conferência.
3. **Gate 2 — tela:** `/planta` com os 6 cômodos, inspetor, drill-down e frescor; módulo no Admin.
4. **Gate 3 — uso:** 1 semana com divergência ≤ 0,5% e acesso dado aos donos. Medir pelo monitor de uso
   (`/atividades?tab=uso`, rota `/planta`). Só então F2.

## 6. Fora da v1 (F2/F3)

Pessoas por setor, tickets/Opas/POPs, técnicos e frota no mapa, campainha do WhatsApp, funil de
propostas e forecast, pátio por chassi com idade, histórico e replay, Realtime, layout editável,
modo TV, Tratorilson narrando, metas com semáforo (quando definidas), simulações "e se".

## 6b. Resultado do Gate 0 (19/10/2026)

Script `scripts/planta-conferir.ts` (antes `planta-gate0.ts`) (só leitura, 18 s, 31 números, NOVA e CASTRO).

- **Conferência:** os 4 números de vencidos (pagar/receber × NOVA/CASTRO) bateram **centavo a centavo**
  com `/api/dre-financeiro/vencidos` em produção (57/126 títulos a pagar, 140/58 a receber).
  Os demais números usam a mesma consulta e o mesmo filtro da tela (fila do financeiro = Kanban,
  PPV = `STATUS_ABERTO_PPV`, OS = `PHASES`).
- **Corte de 1.000 linhas:** `pedidos` tem 538 e `Ordem_Servico` 848 linhas: as rotas das telas não
  paginam, mas ainda não cortam. **`Ordem_Servico` corta quando passar de 1.000.** `logs_ppo` (5.105 linhas)
  JÁ corta: a "data da fase" das OS antigas sai do fallback.
- **Ajustes na regra da v1:**
  - `fluxo_30d` fica negativo desde o 1º dia (sem saldo inicial, a soma começa em zero), então "primeiro dia negativo"
    não diz nada. Mostrar como **saída líquida prevista em 30 dias**, por semana.
  - A tela oficial de vencidos **esconde** o que venceu antes do ano corrente: a receber da NOVA tem
    mais 155 títulos (R$ 253 mil) fora da conta. A planta mostra os dois números separados.
  - `maq_receb_esquecido` (12 NFs, R$ 1,17 mi na NOVA) mistura remessas NOVA↔CASTRO e notas de 2021–2022:
    é uma lista para limpar no recebimento, não "máquina vindo".
  - `emissao_nfe` mistura DD/MM/AAAA e ISO: normalizar no SQL.
  - "OS atrasada" do POS = métrica aberta de `tecnico_metricas` com dias > 0 (não é previsão vencida).
- **Segurança (fora deste plano):** `/api/dre-financeiro/vencidos`, `saldo-projetado`, `saude` e `fluxo`
  respondem **sem login** em produção (nomes, valores e títulos). Já tratado na branch
  `fix/seguranca-tema1-rotas` (lote 2, "login no DRE"), ainda não mesclada. Quando entrar, a conferência
  do Gate 0 precisa chamar a rota com o `CRON_SECRET` ou importar o cálculo.

## 6c. Gate 1 (24 h) e Gate 2 (20/10/2026)

- **Gate 1 em produção:** 291 rodadas em 24 h (290 OK, 1 interrompida por deploy), mediana 3 s, máximo 10 s,
  maior intervalo 5,1 min. 4 rodadas com erro intermitente de leitura no financeiro → a leitura tenta de novo 1×
  e um cômodo com erro mantém o último número bom (48a1706f). Tabela gravada × cálculo novo: 0 divergência.
  A comparação com a tela oficial de vencidos agora exige login; decisão do usuário: conferir no navegador,
  pelos links da tela (não passar token).
- **Gate 2 — tela `/planta`:** `components/planta/PlantaViva.tsx` + `planta.module.css` (cores em classe: o modo
  escuro do portal remapeia `style=`). Seis cômodos em grade CSS; canos em SVG calculados pela posição real das
  salas (`ResizeObserver`), correndo quando o dado está em dia e pontilhados parados quando está velho; camadas
  Dinheiro/Máquinas/Pedidos e peças; NOVA/CASTRO/Todas. Clique num número → painel lateral com o detalhe
  (dias de atraso, semanas, fases, idade dos PPV, robôs), a lista de registros e "Abrir a tela oficial".
- **Detalhe = os mesmos registros do número:** `selecionar()` em `regras.ts` é a fonte única do cálculo e da lista
  (`itensDoKpi`); conferido nos 43 números com dados reais (0 divergência) e em testes. Rota
  `GET /api/planta/kpi/[id]` lê só o cômodo pedido, até 200 registros, 403 para número sensível sem admin,
  registra `drill` no `audit_log`.
- **Módulo `planta`** no catálogo de permissões, Admin, menu e dashboard (com entrada em `systemToModulo`).
  Testado com o usuário comum "Mecânico Teste": sem o módulo → 403; com o módulo → 11 números do financeiro
  lacrados (sem valor e sem detalhe), PPV visível, detalhe sensível 403.

## 7. Riscos

| Risco | Cuidado |
|---|---|
| Número bonito e errado | Gate 0 + conferência diária; drill-down sempre disponível |
| Espelho velho parecendo ao vivo | Selo de frescor por cômodo; cano parado e hachurado quando velho |
| Vazar financeiro | Tabela sem acesso da anon key; corte na rota; drill-down 403; modo TV fora da v1 |
| Pesar no banco | 1 RPC a cada 2 min com agregação no Postgres; tela lê ≈ 25 linhas |
| Duas sessões mexendo no mesmo arquivo | Registro no portal (catálogo, navItems, dashboard) em commit separado e pequeno |
| Virar enfeite | Critério de uso no Gate 3; se não bater, vira um card no dashboard |
