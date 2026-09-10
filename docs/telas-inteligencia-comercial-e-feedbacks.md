# Telas de Inteligência Comercial, Sugestão de Compra e Feedbacks & CRM

> Descrição funcional de 7 telas do Portal Nova Tratores, levantada a partir do código
> (`src/app/(portal)/...`, `src/app/api/...`, `src/lib/...`, `sql/`).
> Última atualização: 10/09/2026.
>
> | Tela | Rota | Módulo (permissão) |
> |---|---|---|
> | [Inteligência Comercial](#1-inteligência-comercial) | `/estoque/inteligencia-comercial` | `estoque` › `inteligencia-comercial` |
> | [Sugestão de Compra](#2-sugestão-de-compra) | `/estoque/sugestao-compra` | `estoque` › `sugestao-compra` |
> | [RFM — Clientes Inativos](#4-rfm--clientes-inativos) | `/feedbacks/rfm` | `feedbacks` › `rfm` |
> | [CRM — Clientes Recentes](#5-crm--clientes-recentes) | `/feedbacks/crm` | `feedbacks` › `crm` |
> | [Histórico de atendimentos](#6-histórico-de-atendimentos-clientes) | `/feedbacks/clientes` | `feedbacks` › `clientes` |
> | [Agenda de follow-up](#7-agenda-de-follow-up) | `/feedbacks/agenda` | `feedbacks` › `agenda` |
> | [Oportunidades](#8-oportunidades) | `/feedbacks/oportunidades` | `feedbacks` › `oportunidades` |

---

## 1. Inteligência Comercial

**Rota:** `/estoque/inteligencia-comercial` · **Arquivo:** `src/app/(portal)/estoque/inteligencia-comercial/page.tsx` · **Lib:** `src/lib/estoque/inteligencia-comercial.ts`

### 1.1 Objetivo

Transforma o histórico transacional espelhado do Omie (notas de entrada + itens de venda, desde 11/2022) em ações comerciais. Responde a quatro perguntas: o que compramos e de quem (Compras), quem são os clientes e o que compram (Clientes), quais produtos estão "na hora de vender" segundo um score RFM por produto (Oportunidades) e quem ligar agora por padrão sazonal, pela ótica do cliente (Sugestões sazonais) e pela ótica do produto (Sugestões por produto). Sobre essas listas roda um mini-CRM append-only: o vendedor abre a linha, vê os clientes/peças envolvidos e registra o desfecho do contato (Vendeu / Não vendeu + motivo / Sem resposta).

Todo o cálculo é server-side, varrendo o histórico inteiro a cada requisição (sem cache), por conta Omie NOVA / CASTRO / Todas.

### 1.2 Acesso e menu

- Permissão `estoque:inteligencia-comercial` (`src/lib/permissoes/catalogo.ts`, bloco `ACOES_POR_MODULO.estoque`). Sem permissão → `<SemPermissao />`.
- Registrada em `src/app/(portal)/estoque/paginas.ts` no grupo **Análise** (📊) do submenu `EstoqueNav`.
- Não há migration própria (só leitura), exceto o CRM: `sql/create-oportunidade-crm.sql` (aplicada 26/08/2026).

### 1.3 Layout geral

- Cabeçalho com título, subtítulo e o `ContaSelector` (Todas / Nova / Castro), compartilhado com as demais telas do Estoque via `ContaProvider` (persistido em `localStorage['omie_conta_selecionada']`). Trocar a conta zera o cache de todas as abas.
- **Sem filtro de período**: sempre o histórico completo. Os params `&mes=` e `&lead=` existem na API (simular "hoje" e antecedência sazonal), mas não têm UI.
- **Cinco abas** (pílulas): Compras · Clientes · Oportunidades (RFM) · Sugestões (sazonal) · Sugestões por produto. Cada aba carrega sob demanda e fica em cache em memória.
- **Sem KPIs em cards nem gráficos.** Os únicos indicadores são frases-contador acima da tabela.
- **Tabela genérica `TabelaAnalise`**: ordenação por clique no cabeçalho, linha de inputs de filtro por coluna, contador de linhas, botão **Exportar CSV** (`;`, BOM UTF-8, decimal com vírgula; exporta as linhas filtradas, não só as renderizadas), corpo com cabeçalho sticky (70vh) e linhas expansíveis (accordion, uma por vez).
- **Filtro com operador** (`casaFiltro`): `>`, `>=`, `<`, `<=`, `=` seguidos de número comparam numericamente; texto faz substring case-insensitive.
- Não há modais: toda interação secundária é inline (expand). Erros via `alert()`.

### 1.4 Abas

**Compras** — agregado por produto comprado. Colunas: SKU, Descrição, Qtd comprada, Valor total, Nº fornec., Fornecedores (`A | B | C`), Nº NFs, Última compra, Vinculado (✓). Ordena por Valor total desc. Sem expand. Fonte: `notas_entrada` (itens JSONB). Itens sem vínculo a produto (nCodProd = 0, ~34%) agrupam pelo código do fornecedor e ficam com `vinculado=false`.

**Clientes** — agregado por cliente (`codigo_cliente` + conta). Toggle **Peças / Máquinas / Ambos** re-segmenta no servidor (regra de família do `giro.ts`). Colunas: Cliente, Conta, Nº vendas (pedidos distintos), Nº produtos, Qtd total, Valor total, Última venda, Produtos vendidos (top 8), Cód. Ordena por Valor total desc.
Expand (`ExpandClienteSugestoes`, rota `sugestoes-cliente?cliente=`): lista os **tipos de peça** que aquele cliente compra, sazonais primeiro (badge 🟢 Na época / 🟡 Chega em ~N d / ⚪ Em N d, mês típico, janela, concentração, anos), depois botão "Ver outros N tipos (sem época)". Cada card lista até 50 SKUs e tem o botão **Registrar contato**.

**Oportunidades (RFM)** — por produto. Barra: "N produtos estão na hora de vender" + botão **Exportar oportunidades (lista de ligação)** (CSV produto × cliente com telefone, via `?aba=export-oportunidades`). Colunas: Na hora? (✓), SKU, Descrição, Estoque, Última venda, Dias s/ vender, Interv. médio (d), Nº vendas, Qtd vendida, Faturamento, RFM. Ordena por "Na hora" desc.
Expand (`ExpandOportunidade`, rota `clientes-produto?produto=`): clientes que já compraram o produto (Cliente · Conta, Telefone, Nº compras, Última compra, Valor, Último contato com badge, Ação **Registrar** → form inline Vendeu / Não vendeu (motivo obrigatório) / Sem resposta + observação). Até 200 clientes.

**Sugestões (sazonal)** — por cliente × grupo de peça. Barra: "N sugestões estão na época ou chegando". Colunas: Cliente, Telefone, Grupo (peça), Quando (na época / chegando / fora, com sufixo "· já comprou"), Mês típico, Janela, Concentração (%), Anos, Nº compras, Valor total, Última compra. Ordena por Quando.
Expand (`ExpandSugestao`, sem fetch): cabeçalho narrativo ("Fulano costuma comprar Discos em Outubro, janela set–nov"), até 100 SKUs do grupo e o **Registrar contato** (gravado na peça representativa do grupo = SKU de maior valor).

**Sugestões por produto** — espelho da anterior, por grupo de peça. Barra: "N grupos de peça têm clientes na época de comprar". Colunas: Grupo (peça), Quando (produto) — "—" se o grupo não é sazonal no agregado, Mês típico, Janela, Concentração, **Clientes na época**, Nº clientes, Nº vendas, Valor total, Última venda. Ordena por Clientes na época desc (tipos amplos como Filtros não são sazonais no agregado, mas têm muitos clientes na época; é esse o sinal acionável).
Expand (`ExpandProdutoClientes`, rota `clientes-grupo?tipo=|produto=`): checkbox "Só clientes na época/chegando" (ligado por padrão) + tabela de clientes com Quando, Mês típico, Nº compras, Valor, Última e **Registrar contato** por linha. Até 200 linhas.

### 1.5 Regras de cálculo

- **RFM por produto** (`oportunidadesRFM`): `intervalo_medio = (última − primeira) / (nº datas distintas − 1)`; `dias_desde_ultima` até hoje. **Na hora** = `estoque > 0` E `n_vendas ≥ 3` E `dias_desde_ultima ≥ intervalo_medio × 0,8`. Scores 1..5 por quintil: F = nº vendas, M = faturamento, R = recência invertida; `RFM = R + F + M` (3..15). Estoque de `produtos.estoque`.
- **Motor sazonal** (`analisarGrupoSazonal`): histograma de 12 meses sobre pedidos distintos; pico = janela deslizante de 3 meses (pico ± 1) de maior soma; `concentracao = soma da janela / total`. Constantes: `SAZ_MIN_ANOS = 2`, `SAZ_MIN_CONCENTRACAO = 0,5`, `SAZ_LEAD_DIAS = 45`, `SAZ_JA_COMPROU_DIAS = 100`. Sazonal = ≥ 2 pedidos, ≥ 2 anos distintos, concentração ≥ 50%. Status `na_epoca` (mês atual na janela) / `chegando` (≤ 45 dias) / `fora`. `ja_comprou_ciclo` = última compra dentro da janela há ≤ 100 dias.
- **Grupo de peça** = característica `produto_tipo.tipo` (ex. "Discos"); produto sem Tipo cai no próprio SKU. Só peças.
- **Nome/telefone do cliente**: cascata `portal_nt_clientes_cadastro_omie` → `gv_clientes_omie_cache` → `nome_cliente` da venda → `#código`.
- **CRM** (`registrarContato`): valida produto + cliente, `resultado ∈ {vendeu, nao_vendeu, sem_resposta}`, motivo obrigatório em `nao_vendeu`; conta gravada em MAIÚSCULO. "Último contato" = registro mais recente por `created_at`.

### 1.6 Fontes de dados e APIs

Tabelas: `notas_entrada`, `vendas_itens`, `produtos`, `produto_tipo`, `portal_nt_clientes_cadastro_omie`, `gv_clientes_omie_cache`, `oportunidade_motivo` (9 motivos seed), `oportunidade_contatos` (append-only; RLS ligada sem policies → só service role).

| Endpoint (`/api/estoque/inteligencia-comercial`) | Método | Params | Retorno |
|---|---|---|---|
| `/` | GET | `aba=compras\|clientes\|oportunidades\|export-oportunidades\|sugestoes-sazonais\|sugestoes-produto`, `conta`, `grupo` (só clientes), `mes`, `lead` | `{ itens, total, na_hora?, sugeridas? }` |
| `/clientes-produto` | GET | `produto`, `conta` | clientes que compraram o produto |
| `/clientes-grupo` | GET | `tipo` ou `produto`, `conta`, `mes`, `lead` | clientes do grupo com status sazonal |
| `/sugestoes-cliente` | GET | `cliente`, `conta`, `mes`, `lead` | grupos de peça do cliente |
| `/contatos` | GET / POST | — / `ContatoInput` | motivos ativos / `{ ok, id }` |

Todas com `maxDuration = 120`.

### 1.7 Gotchas

- `produtos.conta_omie` é **minúsculo** (`nova`/`castro`); `vendas_itens` e `notas_entrada` são MAIÚSCULAS.
- Varredura completa de `vendas_itens` a cada requisição (paginação de 1000 em 1000); "Compras › Todas" leva ~18 s.
- A tabela renderiza no máximo **500 linhas** (o CSV exporta tudo o que passou no filtro).
- O CRM degrada silenciosamente para vazio se a tabela faltar; o autor do contato vem do body do POST, não da sessão; o POST não checa permissão.
- Sem testes automatizados.

---

## 2. Sugestão de Compra

**Rota:** `/estoque/sugestao-compra` · **Arquivo:** `src/app/(portal)/estoque/sugestao-compra/page.tsx` · **Lib:** `src/lib/estoque/sugestao-compra/` (`motor.ts`, `serie.ts`, `snapshot.ts`, `fornecedores.ts`, `backfill-fornecedor.ts`, `pdf-pedido.ts`, `ajuda.ts`)

### 2.1 Objetivo

Substitui a compra de peças "por feeling" por uma sugestão de reposição calculada e **consolidada por SKU entre NOVA e CASTRO**. Toda madrugada um robô gera um snapshot com o cálculo completo de todos os SKUs da família Peças. A tela lê sempre o último snapshot e apresenta, por fornecedor preferencial, quanto comprar de cada item, com semáforo de risco de ruptura, memória de cálculo auditável item a item e o caminho para materializar a decisão num **pedido de compra interno**, que depois é acompanhado e recebido na própria tela. Não há push para o Omie: o pedido vive no portal e serve de fonte de **lead time realizado** que realimenta o motor.

### 2.2 Acesso e menu

- Permissão `estoque:sugestao-compra`; todas as rotas do fluxo exigem a mesma chave via `exigirPermissao`, exceto `/inspecao`, que só exige acesso ao módulo.
- Registrada em `estoque/paginas.ts`, grupo **Análise**. Link cruzado para `/estoque/config-compras` (parâmetros de fornecedor/item, permissão `estoque:config-compras`).
- Botão de ajuda "?" ao lado do título (`AjudaCompras` + `AJUDA_SUGESTAO`).

### 2.3 Layout

**Cabeçalho**: título, "?" e o carimbo `Snapshot de <data/hora>`.

**Aba Sugestões**
- Filtro-eixo único: `select` **Fornecedor** (por nome, "Todos" com contagem). Alerta âmbar quando quase nenhum fornecedor está atribuído. Não há filtro de conta, família ou período (consolidação fixa NOVA+CASTRO, horizonte fixo).
- **Chips em AND**, cada um com contagem no recorte do fornecedor: Já era · Crítico · Atenção · Abaixo do mínimo · Zerado com demanda · Sem giro 12m · Entrando na safra (índice sazonal 45d ≥ 1,15) · Saindo da safra (≤ 0,85) · Tem no outro pátio · Sem tipo. Botão "limpar".
- **Tabela** (`TabelaOrdenavel`, ordenação + filtro por coluna + "Mostrar mais" de 300 em 300): checkbox, SKU, Descrição, Tipo, **Empresa** (NOVA / CASTRO / Ambas), Curva, Regime, Estoque (tooltip com nova/castro e valor cru negativo), Trânsito, Mínimo, Prev 30·60·90, Sugestão, Valor est., Alerta (badge) e botão **ver**.
- **Rodapé sticky de seleção** (≥ 1 item marcado): "N itens · Q un · R$ V", `select` de **Conta compradora** (NOVA/CASTRO), `select` de **destino** (Novo pedido ou pedido aberto existente) e botão **Gerar pedido / Adicionar ao pedido**. Itens sem `codigo_produto` na conta escolhida ficam de fora e a mensagem avisa quantos.
- Sem KPIs em cards, sem exportar CSV e sem botão de snapshot manual pela UI.

**Painel de inspeção por SKU** (`PainelDetalhe`, drawer lateral de 560 px): por conta mostra tipo, marca "sazonal", estoque, cmd/dia, demanda 45d e um gráfico de **12 barras mensais** (barra âmbar = houve ruptura no mês). Abaixo, a **Memória de cálculo (consolidado)**: linhas `{rótulo, valor, origem}` e a faixa "Sugestão: N un · alerta". Recalcula ao vivo pela rota `/inspecao` (passa a `curva` do snapshot para bater com a lista).

**Aba Pedidos abertos** (`AbaPedidos`): Pedido (#id), Conta, Fornecedor, Data, Itens, Pedida × Recebida, Dias (alerta "!" acima de 60), Status, botão **PDF** (pdfkit, abre em nova aba) e botão **Receber** → `ModalReceber` (data de entrada, NF opcional, quantidade por linha pré-preenchida com o restante).

### 2.4 Motor de cálculo (`motor.ts`, puro e testado)

- **Demanda** (`serie.ts › montarSerie12m`): soma de `-qtde_saida` de `estoque_movimentos` **apenas com `cod_origem = 'VEN'`** (balcão + OS faturada), `grupo='peca'`, `cancelado=false`, 12 meses. `qtde_saida` é negativo no razão. Devolução, remessa, ajuste e transferência ficam de fora. Também conta `diasComSaldoPositivo` por mês.
- **Correção de censura** (`corrigirCensura`): `fator = min(2, diasNoMes / diasComSaldoPositivo)`; mês zerado por falta de estoque é venda perdida, não falta de procura.
- **Nível diário e sazonalidade**: `cmdDiario = Σ ajustadas / 365`, `sigma` = desvio-padrão mensal; `demandaJanela` soma dia a dia aplicando o índice sazonal por Tipo (`vw_indice_sazonal_tipo`). Horizonte fixo `JANELA_PADRAO = 45` dias (lead 30 + ciclo 15); também produz prev 30/60/90.
- **Consolidação NOVA+CASTRO** (`consolidar`): demandas, previsões, estoque e cmd somados; série mensal poolada; sigma poolado `√(Σ σ²)`.
- **Regime** (`classificarFrequencia`): ≥ 9 meses com saída = alta/estatístico; 4–8 = média/estatístico; 1–3 = baixa/intermitente; 0 = sem histórico. **Curva ABC** vem do job (`calcularCurvaABC`, 12 meses); entre contas vence a melhor.
- **Nível de serviço** (`MATRIZ_NS`): A 0,97/0,95 · B 0,95/0,92 · C 0,95/0,88 (alta/média); item crítico força 0,98; intermitente → sem colchão. `z = invNormal(ns)`.
- **Estoque de segurança**: `SS = z · √(LT · σ_dia² + cmd² · σ_LT²)` (só regime estatístico). Mínimo efetivo = mínimo manual (se dentro da validade) senão SS.
- **Sugestão**: `alvo = demanda45d + mínimo`; `qtdBruta = max(0, alvo − estoque − trânsito)`; arredonda para cima ao múltiplo de embalagem. Sob encomenda ou sem histórico sem mínimo manual → 0 + `nao_comprar`.
- **Alerta** (`classificarAlerta`): `diasRuptura = (estoque + trânsito) / cmd`; `< lead time` → **já era**; `< 45` → **crítico**; `< 90` → **atenção**; senão **ok**.
- **Estoque negativo** (erro de reconciliação) é clampado a 0 antes do pool; valor cru fica na tooltip.
- **Lead time**: `item_param.lead_time_override` → `fornecedor_param.lead_time_declarado` → 30 dias. Com ≥ 8 entregas medidas (`vw_lead_time_realizado`) passa a usar o lead medido e o sigma real.

### 2.5 Fontes de dados, cron e APIs

- **Tabelas** (`sql/create-sugestao-compra.sql`, sem RLS): `sugestao_compra_snapshot`, `pedido_compra`, `pedido_compra_item`, `pedido_recebimento_vinculo`, `fornecedor_param`, `item_param`.
- **Views** (`sql/create-sugestao-compra-views.sql`): `vw_saida_mensal_item`, `vw_indice_sazonal_tipo`, `vw_lead_time_realizado`.
- **Base lida**: `produtos` (família `%peç%`), `estoque_movimentos`, `produto_tipo`, `recebimentos_nfe`, `compras_itens`, `vendas_itens` (curva ABC).
- **Cron**: `.github/workflows/estoque-snapshot-sugestao-compra.yml`, **06:30 UTC (03:30 BRT)**, chama `GET /api/estoque/cron/snapshot-sugestao-compra` com `Bearer CRON_SECRET`. O job (`gerarSnapshotSugestao`) roda o backfill de fornecedor preferencial, lê tudo por conta, consolida por SKU, insere em lotes de 500 com um `snapshot_id` novo e apaga snapshots com mais de 90 dias.

| Endpoint | Método | O que faz |
|---|---|---|
| `/api/estoque/sugestao-compra` | GET | último snapshot paginado + lista de fornecedores com contagem |
| `/api/estoque/sugestao-compra/inspecao?sku=&curva=` | GET | recalcula ao vivo e devolve série por conta + memória de cálculo |
| `/api/estoque/pedido-compra` | GET / POST | lista pedidos abertos por conta / cria pedido a partir da seleção |
| `/api/estoque/pedido-compra/[id]` | GET | detalhe |
| `/api/estoque/pedido-compra/[id]/itens` | POST | adiciona itens a pedido aberto |
| `/api/estoque/pedido-compra/[id]/receber` | POST | grava recebimento e recalcula status |
| `/api/estoque/pedido-compra/[id]/pdf` | GET | PDF do pedido |

Testes: `motor.test.ts` e `serie.test.ts` ao lado do código (vitest).

### 2.6 Migrations e gotchas

- Migrations aplicadas em produção: `create-sugestao-compra.sql`, `create-sugestao-compra-views.sql`, `alter-pedido-compra-fornecedor-nullable.sql`, `alter-pedido-vinculo-id-receb-nullable.sql`. O `docs/inventario-modulo-sugestao-compra.md` é **anterior** ao módulo e não descreve o estado atual.
- `codigo_produto` **diverge 100% entre as contas**; a chave comum é o SKU (`produtos.codigo`). O snapshot guarda `codigo_produto_nova/_castro` só para drill e para montar o pedido na conta certa.
- `em_transito` é **sempre 0** na v1 (o pedido gerado ainda não abate da sugestão). `revisoes_45d` também é 0 (sem camada de revisões).
- Fornecedor preferencial vem de `compras_itens × recebimentos_nfe` (cobertura ~87% NOVA, baixa em CASTRO); a tabela `Fornecedores` não é usada. Override manual em `item_param` nunca é sobrescrito.
- `fornecedor_param.ciclo_dias`, `nivel_servico_a/b/c`, `pedido_minimo_valor` e `ativo` são gravados mas **não usados** pelo motor.
- A inspeção recalcula ao vivo e pode divergir do snapshot noturno se a curva passada for outra.
- Casing de conta: minúsculo em `produtos`/`estoque_movimentos`/views/`item_param`; MAIÚSCULO em `produto_tipo` e `compras_itens`.

---

## 3. Módulo Feedbacks & CRM — estrutura comum

As cinco telas de `/feedbacks` compartilham:

- **Layout e permissão** (`src/app/(portal)/feedbacks/layout.tsx`): exige `temAcesso("feedbacks")` e, para cada sub-rota, `pode("feedbacks", <slug>)`. Permissão **granular por tela**. Módulo `feedbacks` no grupo **Comercial** do catálogo; card "Feedbacks & CRM" no dashboard; `/feedbacks` redireciona para `/feedbacks/crm`.
- **Abas** (`FeedbackTabs.tsx`): CRM (vermelho) · RFM (índigo) · Histórico de atendimentos (ardósia) · Relatórios (azul) · Agenda (roxo) · Oportunidades (verde). Cada aba só aparece se o usuário tem a permissão.
- **Tabelas** (`sql/create-feedbacks-module.sql`):
  - `feedback_registros` — CRM e RFM na mesma tabela, discriminada por `tipo`. Comuns: `nome`, `telefone`, `email`, `trator`, `tecnico`, `codigo_omie`, `data_contato`. CRM: `servico`, `data_servico`, `status_cliente`, `nota` (1–10), `feedback`, `nps`, `melhoria`. RFM: `ultimo_servico`, `motivo`, `prioridade`, `acao`, `sem_resposta`, `revisao_confirmada`, `tentativas`. Workflow: `atendente_id/nome`, `aberto_em`, `concluido_em`, `status_atendimento`, `arquivado_motivo`, `origem_dados`.
  - `feedback_clientes_info` — "pasta" do cliente, chave `cliente_key` (`omie_<código>` ou `nome_<NOME>`), com `funcionarios`, `fazendas`, `tags`, `equipamentos` (JSONB), `cidade`, `email`.
  - `feedback_oportunidades` e `feedback_config_regras` (ver §8).
  - `audit_log` com `sistema='feedbacks'`.
- **RLS** (`sql/p1-rls-feedbacks.sql`): policies `TO authenticated` com `USING(true)`. Qualquer usuário logado lê e escreve tudo; o escopo é por permissão de tela, não por linha.
- **Origem dos dados** (`origem.ts`): badge NOVA (vermelho), CASTRO (laranja), Omie (azul), Portal (cinza).

> `src/components/crm/CrmNav.tsx` e `src/lib/crm/demo.ts` pertencem a **outra** rota (`/crm`, "CRM de Desova"), que é uma demonstração com dados fictícios. Não têm relação com `/feedbacks/crm` nem `/feedbacks/rfm`, que usam dados reais.

---

## 4. RFM — Clientes Inativos

**Rota:** `/feedbacks/rfm` · renderiza `<ListaRegistros tipo="rfm" />` (`src/components/feedbacks/ListaRegistros.tsx`)

### 4.1 Objetivo

Fila de trabalho para **reativar clientes parados**: quem não faz serviço há tempo, por que parou, o que foi conversado e se voltou a agendar. É a contraparte proativa do CRM.

### 4.2 Layout

- Título "🟣 RFM — Clientes Inativos"; badge `X de Y`; botão **Filtros avançados**; botão **Novo registro**.
- Busca livre por nome, trator, técnico, código Omie, feedback ou motivo.
- Filtros: Técnico, **Atendimento** (pendentes por padrão, atrasados +24h, concluídos, arquivados, todos), Data de/até, **Prioridade** (Urgente / Normal / Inativo) e **Sem resposta** (todos / sim / não). Os dois últimos são exclusivos do RFM.
- Grade de `RegistroCard`. O card mostra nome, badge de origem, técnico, trator, prioridade, pílulas de status ("SEM RESPOSTA" = flag histórica; "NÃO RESPONDEU" = `status_atendimento`), 💀 se o cliente tem a tag "Não contatar", ⚠️ se falta e-mail e telefone, banner do motivo de arquivamento e borda vermelha se está aberto há mais de 24 h.

### 4.3 Cliques

- Corpo do card → `ModalHistoricoCliente` (OS, PV e requisições do cliente).
- **Preencher atendimento** → `ModalFeedback` em modo RFM: Último serviço, Prioridade, Motivo do contato, "O que foi conversado" (`acao`), "Serviço confirmado" (`revisao_confirmada`). Técnico e data do último serviço são pré-preenchidos da última OS se o campo estiver vazio.
- **Concluir / Reabrir / Respondeu / Arquivar / Desarquivar** mudam `status_atendimento`. Arquivar pede o motivo (`prompt()` nativo).

### 4.4 Fontes

`listarRegistros("rfm")` em `feedback_registros`; em paralelo (best-effort) `buscarUltimasOSPorCliente()` na tabela `Ordem_Servico` (match por nome exato) e `listarClientesInfo()` para tags/caveira.

### 4.5 Gotchas

`prioridade` é texto livre (sem CHECK). `sem_resposta` e `status_atendimento='sem_resposta'` são conceitos distintos e rendem pílulas diferentes.

---

## 5. CRM — Clientes Recentes

**Rota:** `/feedbacks/crm` · renderiza `<ListaRegistros tipo="crm" />`

### 5.1 Objetivo

Pós-venda / pós-serviço: registrar a ligação de satisfação depois de um serviço, com nota, NPS, ponto de melhoria e a fala do cliente, e **atualizar o cadastro do cliente no Omie no mesmo ato**. É a rota-padrão do módulo.

### 5.2 Layout

Igual ao RFM (mesmo componente), com título "🔴 CRM — Clientes Recentes", botão **Novo feedback** e dois filtros próprios: **Status** (Satisfeito / Neutro / Insatisfeito / Aguardando) e **Nota mínima** (slider 0–10).

### 5.3 `ModalFeedback` (modo CRM), 1080 px em duas colunas

- **Esquerda — Atendimento**: `ClienteAutocomplete` (busca em `portal_nt_clientes_PRINCIPAL` por razão social, fantasia ou CNPJ; preenche nome, telefone, e-mail e `codigo_omie`), `ProjetoAutocomplete` (busca em `portal_nt_projetos_PRINCIPAL` e na tabela interna `tratores`, dedup por chassi), `TecnicoSelect` (`GET /api/pos/tecnicos`), datas, `StarsRating` (10 estrelas), feedback, NPS, melhoria e o checkbox **"Cliente não respondeu"**.
- **Direita — `PainelDadosCliente`**: checklist de completude (Endereço / Cidade / Telefone / E-mail / Localização), endereço com **mapa Leaflet** (`MapaPropriedade`: clique ou arraste do pino, lat/lng editáveis), contatos e **tags**.
- **Rodapé**: "Não contatar" / "Reativar contato" à esquerda; "Cancelar" e o botão único **"Salvar atendimento + dados"**.
- **Header**: botão "Log" abre `LogAcoesCliente` (audit_log do cliente).

### 5.4 Regras de negócio

- **Salvar não conclui.** Concluir é ação explícita no card.
- **Regra das 24 h**: "Cliente não respondeu" fica bloqueado enquanto o registro tem menos de 24 h desde `aberto_em` ("Disponível em Xh").
- **Idempotência**: um `savedIdRef` evita duplicar em retry. O painel de dados salva **antes** do atendimento; se falhar, o modal fica aberto mostrando o erro parcial.
- **Tags**: união Portal ∪ Omie. Tags estruturais (Cliente / Fornecedor / Funcionário) são só-leitura 🔒. Lista predefinida `TAGS_CLIENTE` (pendência cadastral, cliente chato, não confiável, Ouro, Agricultor, Pecuarista…) + tag livre.
- **💀 Caveira** = tag "Não contatar". `ModalConfirmarCaveira` oferece dois caminhos: só marcar no Portal (reversível) ou marcar **e inativar o cadastro no Omie** (exige checkbox de confirmação e `codigo_omie`). "Reativar contato" remove a tag e reativa no Omie. Tudo vai para o `audit_log`.
- Filtro padrão "pendentes" esconde concluídos, arquivados e clientes com caveira.
- Ao salvar com trator preenchido, o equipamento entra na pasta do cliente sem duplicar.

### 5.5 Integração com o Omie (`/api/feedbacks/cliente-omie`)

- **GET** `?codigo_omie=` lê o **espelho no Supabase** (`portal_nt_clientes_cadastro_omie`), não o Omie ("a API do Omie trava com muitas requisições"). Devolve empresa, nomes, `inativo`, tags e cadastro.
- **PATCH** `{codigo_omie, cadastro?, tags?, inativo?}` grava de fato no Omie: `ConsultarCliente` + `AlterarCliente` (reenvia o cadastro completo), tags via `/geral/clientetag/` (diff → `IncluirTags` / `ExcluirTags`). Timeout 25 s, retry em HTTP 429 (3×, backoff). Multiempresa Nova Tratores / Castro Peças resolvida por `cod_cli`. Espelha o resultado de volta no Supabase.
- Localização: lê de `portal_nt_clientes_PRINCIPAL` e grava via `PUT /api/mapa/clientes`.

### 5.6 Gotchas

O GET devolve `telefone2`, `fax`, `numero`, `complemento` sempre vazios (não existem no espelho); se o usuário não digitar, o `AlterarCliente` pode sobrescrever com vazio. Localização não pode ser salva se o cliente não tem linha no mapa. `prompt()`/`confirm()` nativos. `CadastroOmieSecao.tsx` e `MiniMapaCliente.tsx` existem mas não são usados por nenhuma tela.

---

## 6. Histórico de atendimentos (Clientes)

**Rota:** `/feedbacks/clientes` · **Arquivo:** `src/app/(portal)/feedbacks/clientes/page.tsx`

### 6.1 Objetivo

Visão 360º **por cliente** (não por registro): agrega todos os atendimentos CRM e RFM do mesmo cliente numa ficha única com estatísticas, equipamentos, funcionários, fazendas e uma linha do tempo.

### 6.2 Layout (grid `320px | 1fr`)

- **Sidebar**: busca (nome ou código Omie), ordenação (Mais recente / Mais atendidos / Nome A–Z / Melhor nota / Pior nota), contador "X de Y clientes" e a lista. Cada item tem bolinha de status (verde ≥ 8, âmbar ≥ 5, vermelho < 5, cinza sem nota), contadores `N🔴 · N🟣`, nota média e `#codigoOmie`.
- **Painel**: nome, telefone / Omie / cidade / e-mail, pílulas de tag (💀 para "Não contatar"), botão **✎ Editar perfil**; 4 stats (Total / CRM / RFM / Nota média); blocos 🚜 Equipamentos (pasta ∪ `trator` dos atendimentos), 👥 Funcionários, 🌾 Fazendas; e `TimelineRegistros`.
- **Timeline**: bolinha CRM vermelha / RFM índigo, chip de status, atendente, motivo de arquivamento e botão **✎ Editar** (abre `ModalFeedback` no tipo do registro).
- **`ModalPerfilCliente`**: CRUD de cidade, e-mail, funcionários (nome / cargo / telefone / fazenda) e fazendas (nome / cidade + tratores), gravando em `feedback_clientes_info`.
- **Deep-links**: `?cliente=<cliente_key>` seleciona o cliente; `?registro=<id>` seleciona e abre o modal daquele atendimento.

### 6.3 Fontes e regras

`listarRegistros("crm")` + `listarRegistros("rfm")` concatenados em memória + `listarClientesInfo()`. Agrupa por `clienteKey`; nota média só considera CRM com nota; `ultimaData` = `data_contato → data_servico → ultimo_servico → criado_em`.

### 6.4 Gotchas

Carrega todos os registros sem paginação. O mesmo cliente com e sem `codigo_omie` vira duas fichas. Aqui o `ModalFeedback` é montado sem `onCaveira`, então "Não contatar" não aparece. Grid fixo, sem media query.

---

## 7. Agenda de follow-up

**Rota:** `/feedbacks/agenda` · **Arquivo:** `src/app/(portal)/feedbacks/agenda/page.tsx`

### 7.1 Objetivo

Régua de recontato: por cliente, quantos dias faltam (ou já passaram) para o próximo follow-up, a partir do último contato registrado, com atalho de WhatsApp com mensagem pronta.

### 7.2 Layout

- Quatro `StatCard` clicáveis que funcionam como filtro toggle: **Vencidos** (vermelho), **Próximos 7 dias** (âmbar), **Em dia** (verde), **Total**.
- Busca por cliente ou equipamento.
- Lista: número grande de dias ("+N dias atrasado" ou "N dias restantes"), nome + chip 🔴/🟡/🟢, "Último contato: DD/MM/AAAA (Nd atrás)", técnico, equipamento, último feedback/motivo truncado e botão **📱 WhatsApp** (desabilitado sem telefone).

### 7.3 Regras

- `PRAZO_DIAS = 30` e `PROXIMO_DIAS = 7`, constantes no código. `previsao = dataRef + 30`; `< 0` dias → vencido; `≤ 7` → próximo; senão em dia.
- `dataRef` = `data_contato || data_servico || ultimo_servico`; registros sem nenhuma dessas datas são descartados (aqui **não** há fallback para `criado_em`).
- Agrupa por nome (`trim().toUpperCase()`) mantendo o registro mais recente; ordena do mais atrasado para o menos.
- Link WhatsApp normaliza o telefone (só dígitos, prefixo 55) e monta: "Olá, aqui é da Nova Tratores. Faz cerca de N dias do nosso último contato…".

### 7.4 Fontes e gotchas

Só `feedback_registros` (CRM + RFM). Não usa `lembretes_clientes` (POS) nem `agenda_visao` (agenda de técnicos). A tela é **somente leitura**: abrir o WhatsApp não registra nada nem marca o contato como feito. Agrupa por nome, não por `cliente_key` (grafias diferentes duplicam). Clientes com caveira continuam aparecendo. `new Date("YYYY-MM-DD")` é UTC e pode deslocar a contagem em 1 dia.

---

## 8. Oportunidades

**Rota:** `/feedbacks/oportunidades` · **Arquivo:** `src/app/(portal)/feedbacks/oportunidades/page.tsx` · **Motor:** `src/lib/feedbacks/oportunidades/`

### 8.1 Objetivo

Painel automático de **prospecção proativa**. Um motor server-side cruza a base de tratores vendidos (`tratores`), ordens de serviço (Portal + Omie), pedidos de venda do Omie e os feedbacks coletados, e materializa "oportunidades": clientes que vale a pena contatar agora (revisão vencendo, cliente parado, fora de garantia, venda de peças, up-sell, follow-up). O operador só faz **triagem** dos cards (Atender / Dispensar). Ao atender, a tela **cria automaticamente um registro CRM ou RFM** já atribuído ao atendente, para ser completado em `/feedbacks/crm` ou `/feedbacks/rfm`.

### 8.2 Layout

- **Barra superior**: título 🎯 Oportunidades; botão **❓ Como funciona** (painel explicativo); `select` de **status** (Abertas — padrão — / Atendidas / Dispensadas / Expiradas / Todas); botão **🔄 Recomputar agora** (chama `POST /recomputar` com header `x-sync-manual: true`, mostra o resumo por regra e erros).
- **Kanban** (`KanbanOportunidades.tsx`): colunas = **regras**, não status. Sem drag-and-drop. Ordem: Revisões garantia (🔧) · Garantia em risco (⏳) · Sem OS recente (🏗️) · Fora de garantia (🛡️) · Venda de peças (🔩) · Up-sell potencial (📈) · Follow-up feedback (📞). Cada coluna mostra contagem total e pill de urgentes; cards ordenados por prioridade (Urgente → Normal → Baixa) e nome; paginação de 10 em 10 ("Ver mais 10" / "Ver todas" / "Reduzir").
- **Card** (`OportunidadeCard.tsx`): nome, badge de origem (Omie NOVA / Omie CASTRO / Portal / Tratores), pill de prioridade, 🚜 trator, texto descritivo gerado por regra, caixa **"Última interação"** (OS Omie #N, PV-N, revisão registrada ou entrega do trator) e, se aberta, os botões **Atender** e **Dispensar**. Clique no corpo abre `ModalHistoricoCliente`.
- Não há filtro por regra, técnico, prioridade nem busca; o único filtro é o de status.

**Atender**: define o tipo (R4 → CRM; demais → RFM), monta o prefill com a sugestão da regra, busca telefone/e-mail em `portal_nt_clientes_PRINCIPAL`, insere o `feedback_registros` com `status_atendimento='aberto'` e o atendente logado, e marca a oportunidade como `atendida` com `feedback_id`.
**Dispensar**: `prompt()` do motivo → `status='dispensada'`.

### 8.3 As 7 regras

Parâmetros em `feedback_config_regras.parametros` (JSONB), com defaults no código. Todas (exceto R4) resolvem `codigo_omie` casando nome com `portal_nt_clientes_PRINCIPAL`.

| Regra | O que detecta | Fontes | Parâmetros / prioridade |
|---|---|---|---|
| **R1 Revisões garantia** | Trator cuja próxima revisão obrigatória (50/300/600 h) está a ≤ 15 dias ou atrasada (estimativa por horímetro, `calcularPrevisao`). 1ª revisão usa `Entrega + 50 dias` se vier antes. Descarta se há OS posterior à última revisão. | `tratores`, OS Portal + Omie | Urgente se atrasada. Um card por trator. |
| **R7 Garantia em risco** | Trator **dentro** da garantia (60 m; 12 m se CBU/L) com o **próximo "cheque" Mahindra** (50h/6m, 300h/12m, 600h/24m, 900h/36m … até 3000h/120m desde a Entrega) vencendo em ≤ 2 meses. Cheque conta como feito se registrado em `tratores` ou se há OS/revisão na janela. Pulverizadores (PV ≥ R$ 5.000, garantia 36 m) seguem régua anual. | `tratores`, OS, `pedidos_venda_relatorio` | Urgente se faltam < 30 dias. Cheque já vencido vira card **R6** ("perdeu a garantia"). |
| **R2 Sem OS recente** | Cliente com ≥ 1 trator e nenhuma OS nem feedback há ≥ 90 dias. | `tratores`, OS, `feedback_registros` | Urgente se nada em 2 anos ou ≥ 5 equipamentos. Um card por cliente. |
| **R6 Fora de garantia** | Garantia vencida por tempo: tratores (Entrega + 60/12 m) e implementos (PV das categorias de venda de tratores/implementos/fabricados, 12 m). | `tratores`, `pedidos_venda_relatorio` | Sempre Normal. Recebe também as "perdidas" do R7. |
| **R5 Venda de peças** | Cliente que já comprou e cujo último PV tem ≥ 6 meses. Exclui fornecedores (tag "Fornecedor" e tabela `Fornecedores`). Não exige trator. | `pedidos_venda_relatorio` | Urgente se ≥ 12 meses. |
| **R3 Up-sell potencial** | Cliente com trator há ≥ 12 meses sem nenhum PV (ou sem PV no histórico = "frio total"). | `tratores`, `pedidos_venda_relatorio` | Sempre Normal. |
| **R4 Follow-up feedback** | Último feedback completou 30 dias (janela 30–37). | `feedback_registros` | Sempre Normal. Única que gera **CRM** ao atender. |

### 8.4 Motor de recomputação (`index.ts › recomputar`)

1. Lê os parâmetros; roda R1…R5, depois R6 = `computarR6() ∪ perdidas do R7` e R7 = `emRisco do R7` (R7 memoizado por 2 min porque é chamado duas vezes).
2. Para R1/R2/R3 descarta cards cuja origem não contém NOVA ou CASTRO (corta cadastros pré-Omie e OSs locais sem sync).
3. Dedup em memória pela chave `regra | codigo_omie | chassis | CLIENTE_NOME` e `upsert` com `onConflict (regra, codigo_omie_norm, chassis_norm, cliente_nome_norm)`. **`status` nunca vai no payload**: é assim que atendida/dispensada é preservado; só `detalhes`, `prioridade` e `computado_em` mudam.
4. `expirarAusentes()`: oportunidades **abertas** da regra que não vieram nesta rodada viram `expirada`.
5. Erro numa regra não derruba as outras; a UI mostra `R2_sem_os=ERRO`.

Leituras paginadas (`lerTudo`, 1000 em 1000, teto 100 000) com service role.

### 8.5 Fontes de dados e APIs

- `feedback_oportunidades`: `regra` (CHECK R1…R7), `codigo_omie`, `cliente_nome`, `trator`, `chassis`, `detalhes` JSONB, `prioridade` (Urgente / Normal / Baixa), `status` (aberta / atendida / dispensada / expirada), `atendida_por`, `atendida_em`, `feedback_id` → `feedback_registros`, `dispensada_motivo`, `computado_em`, colunas geradas `*_norm` e índice UNIQUE composto.
- `feedback_config_regras (regra, parametros)`.

| Endpoint | Método | O que faz |
|---|---|---|
| `/api/feedbacks/oportunidades?status=` | GET | lista ordenada por prioridade e data |
| `/api/feedbacks/oportunidades?id=` | PATCH | `{ status, atendida_por, feedback_id, dispensada_motivo }` |
| `/api/feedbacks/oportunidades/recomputar[?regra=]` | POST / GET | roda o motor; auth por `Bearer CRON_SECRET`, `x-railway-cron` ou `x-sync-manual` |

### 8.6 Gotchas

- A tela diz que roda "todo dia às 06:00", mas **não há workflow no repo** chamando a rota; o agendamento é externo (Railway). Se o cron cair, ninguém percebe pela tela.
- `?regra=` só reconhece R1…R4; R5/R6/R7 caem no recompute completo.
- `x-sync-manual: true` basta para disparar o recompute, sem checar sessão nem permissão. GET/PATCH da API também não verificam usuário; a tela lê pelo supabase-js (anon + RLS) e escreve pela API.
- **Match por nome** entre `tratores`, `Ordem_Servico`, `ordens_servico_relatorio` e `pedidos_venda_relatorio` é a costura mais frágil; R1/R2/R3 descartam quem não bate com o cadastro. Match de chassi por substring no campo Projeto pode dar falso positivo.
- OS do Portal limitada a 2 anos; OS do Omie sem filtro de data.
- R4 é janela estreita (30–37 dias): se o cron falhar 8 dias, a oportunidade nunca aparece.
- R5 grava `cliente_nome` em MAIÚSCULO, diferente das outras.
- `carregarMapaClientes()` está duplicada em seis arquivos; cada regra relê `tratores` e `pedidos_venda_relatorio` inteiros.
- Sem testes automatizados.
- Não confundir com `oportunidade_contatos` / `oportunidade_motivo` (`sql/create-oportunidade-crm.sql`), que são o mini-CRM da Inteligência Comercial (§1).

---

## 9. Atendimento (fila + cockpit de ligação)

**Rotas:** `/feedbacks/atendimento` (fila) e `/feedbacks/atendimento/[clienteKey]` (cockpit) · **Permissão:** `feedbacks` › `atendimento` (nova, 10/09/2026) · **Aba** "Atendimento" (âmbar), primeira do `FeedbackTabs`.

### 9.1 Objetivo

Tela para **quem senta para ligar**, sem precisar conhecer o portal: a fila diz quem ligar hoje e em que ordem; o cockpit mostra, numa tela só e sem cliques, quem é o cliente, por que está na fila, máquinas com a próxima revisão, últimos serviços e compras, funcionários e fazendas, atendimentos anteriores e os contatos do WhatsApp. A ligação em si (iniciar, cronômetro, notas com autosave, desfecho) está em §9.6. Desktop, três colunas.

### 9.2 Fila (`page.tsx` + `GET /api/feedbacks/atendimento/fila`)

Uma linha **por cliente** (`cliente_key`), unindo `feedback_oportunidades` com `status='aberta'` e `feedback_registros` com `status_atendimento` em aberto/em andamento (`agruparFila` em `src/lib/feedbacks/atendimento/puro.ts`). Cada linha: nome, prioridade máxima (Urgente › Normal › Baixa), pílulas dos motivos em linguagem de balcão (`REGRA_ROTULO` em `rotulos.ts`: "Revisão de garantia vencendo", "Sem serviço há tempo", "Reposição de peças"…), nº de atendimentos abertos, "🎧 em atendimento por", telefone (do registro ou do cadastro Omie), último contato pelo CRM, "na fila desde" e o botão **Abrir ficha**. Ordem: prioridade → mais antigo; clientes com a caveira ("Não contatar") vão para o fim e ficam **escondidos por padrão**. Chips em AND: Urgentes · Em atendimento · Sem telefone · Mostrar "não contatar"; busca por nome ou código. A rota pagina as três tabelas de 1000 em 1000.

### 9.3 Cockpit (`[clienteKey]/page.tsx` + `Cockpit.tsx` + `GET /api/feedbacks/atendimento/contexto`)

`cliente_key` = `omie_<cod>` ou `nome_<NOME>`. A rota (gate `exigirPermissao("feedbacks","atendimento")`) chama `montarContexto` (`src/lib/feedbacks/atendimento/contexto.ts`), que resolve o nome pelo espelho do cadastro Omie, junta os cadastros duplicados com `codigosDoCliente` (`historico-cliente.ts`, extraída do `api.ts` e parametrizada pelo client Supabase) e monta **oito seções em paralelo, cada uma falhando isolada** (a que cair vira `null` + entrada em `erros`, e o card mostra "Não carregou").

| Coluna | Card | Fonte |
|---|---|---|
| Esquerda | **Cliente**: nome (💀 se "Não contatar"), razão social, código Omie (+N cadastros), CPF/CNPJ, empresa, cidade, endereço, e-mail, propriedade (culturas/ha), "Ver no mapa", tags, avisos de cadastro inativo / pendência, observações; botão **Funcionários e fazendas** (abre `ModalPerfilCliente`) | `portal_nt_clientes_cadastro_omie` (por `cod_cli`; `tags` vem como string JSON `[{"tag":"Cliente"}]`, e `tagsDoCadastro` aceita array, JSON ou lista separada), `portal_nt_clientes_PRINCIPAL` (por `id_omie`; culturas, área, lat/lng), `feedback_clientes_info` (mescla `omie_` e `nome_` do mesmo cliente) |
| Esquerda | **Contatos do WhatsApp** (§9.4) | NovaZap |
| Centro | **Por que ligar**: cada oportunidade aberta com título de balcão, prioridade, trator, texto da regra (`renderizarDetalhes` e `renderizarUltimaInteracao`, agora exportadas do `OportunidadeCard`) e a linha "👉 o que fazer"; atendimentos abertos com botão **Preencher este atendimento** | `feedback_oportunidades` (por códigos OU `cliente_nome_norm`), `feedback_registros` |
| Centro | **Máquinas**: modelo, chassi, entrega, última revisão registrada, **próxima revisão** (horas + data estimada, "ATRASADA" em vermelho, ou "sem estimativa") | `tratores` por nome (`ilike` exato) via `calcularPrevisao` de `lib/revisoes/utils`. **Datas em DD/MM/YYYY são convertidas para ISO antes**, senão a previsão sai inválida. ∪ `equipamentos` da pasta sem duplicar chassi |
| Centro | **Últimos serviços** (10): OS do espelho Omie (`portal_nt_clientes_os`, etapa traduzida; `servicos` é JSON `[{desc}]` e vira texto sem o cabeçalho MODELO/CHASSI/HOR) ∪ `Ordem_Servico` do Portal (técnico, status, projeto), sem duplicar a OS que já foi para a Omie (`Ordem_Omie`) | `unificarServicos` |
| Centro | **Últimas compras** (10): PV com valor, faturado/NF | `portal_nt_clientes_pv` |
| Centro | **Funcionários e fazendas** | pasta |
| Centro | **Atendimentos anteriores** (10): data, "há N meses", CRM/RFM, status, nota, "indicaria", atendente, resumo, botão ver/editar | `feedback_registros` |
| Direita (fixa) | **Ligar para**: telefones grandes com `tel:` e WhatsApp (cadastro + atendimentos + NovaZap, sem repetir: "3882-5655" e "(14) 3882-5655" contam como um, fica o com DDD); aviso vermelho se "Não contatar" | identidade + `useTelefonesWhatsapp` |
| Direita | **Depois da ligação**: dois botões grandes, Reativação/oferta (RFM) e Pós-serviço (CRM), abrem o `ModalFeedback` existente com prefill (nome, telefone, e-mail, código, 1ª máquina); ao salvar, a ficha recarrega | — |

Datas puras `YYYY-MM-DD` são lidas como **local** (`tsData` em `historico-cliente.ts` foi corrigida; `haQuanto` idem). O bug de UTC da Agenda não se repete aqui.

### 9.4 Card "Contatos do WhatsApp" (NovaZap)

Lê, **sem gravar nada**, os contatos do WhatsApp vinculados ao cliente no NovaZap (fork do Chatwoot, repo `Nova-tratores/ChatWoot`). Por contato: nome, avatar, cargo dentro do cliente (`cliente_cargo`: Proprietário em destaque, depois Gerente, Financeiro, Tratorista, Funcionário), telefone com `tel:` e botão WhatsApp, fazendas (`localizacoes`, com link do Maps) e o resumo da última conversa (status Aberta / Pendente / Resolvida / Adiada, atendente, data, não lidas, botão "Abrir no NovaZap"). Nunca traz o texto das mensagens.

- **Lib** `src/lib/chatwoot/`: `config.ts` (env `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN`), `cliente.ts` (HTTP com timeout, header `api_access_token`), `parsers.ts` (funções puras), `contatos-cliente.ts` (orquestração, cache de 5 min por conjunto de códigos, cap de 5 códigos e 8 contatos). Testes em `__tests__/` (parsers + orquestrador com mock).
- **Como acha os contatos:** `GET /search/contacts?q=<cod>:` por código Omie do cliente. É o único endpoint que casa `cliente_ref` (o fork estendeu a busca para `custom_attributes::text`; o `/contacts/filter` por atributo devolve 422 porque não há `custom_attribute_definitions`). Como a busca é ILIKE, `123:` também casa `4123:`, e o filtro exato é feito no código. Funcionário e fornecedor (`tipo_contato`) são excluídos.
- **Estados da seção:** `nao_configurado` (env ausente, um único aviso no log), `indisponivel` (timeout 8 s, 5xx, 429: não retenta, não cacheia; o card oferece "Tentar novamente"), `sem_contatos` (mostra os códigos consultados), `ok` (`truncado` quando passa de 8).
- `src/lib/feedbacks/telefone.ts` centraliza o normalizador de WhatsApp (dígitos + DDI 55; DDD 55 não é confundido com DDI). A Agenda passou a usá-lo.

### 9.5 Gotchas

- Sem as três env do NovaZap, o card fica em "não configurado" e o resto segue normal. As env existem no Railway; para testar local, copiar para o `.env.local`.
- A costura `tratores`/`Ordem_Servico` continua por **nome** do cliente (igualdade sem caixa); cliente com grafia diferente perde essas duas seções. OS/PV/oportunidades/registros vão por código Omie.
- `tratores.Modelo` às vezes traz só "2025.0" (dado de origem).
- Contato do NovaZap vinculado antes de existir `cliente_ref` (só `cliente_cod`) não é encontrado pela busca.
- Follow-ups: Gates 1–3 da Fase 1 (`feedback_chamada`, desfecho, cronômetro, autosave); criar `custom_attribute_definitions` para `cliente_ref`/`cliente_cod` no NovaZap; enviar `cliente_cargo` ao Tratorilson; migrar `chatwoot/vincular` para a lib nova; `ClientePicker.vue`/`ClienteChip.vue` têm a URL do portal fixa no código.

### 9.6 A ligação (Fase 1, Gates 1–3 — 10/09/2026)

**Migration `sql/create-feedback-chamada.sql` (APLICADA 10/09/2026; v1.1 pede re-execução)** + `sql/rollback-feedback-chamada.sql`. Cria `feedback_chamada` (uma linha por ligação: `feedback_id` bigint → `feedback_registros`, `oportunidade_id`, `cliente_key`, `atendente_id` uuid/`atendente_nome`, `iniciada_em`/`encerrada_em`/`duracao_seg` gerada, `telefone_usado`, `notas_ao_vivo`, `status_anterior`, `desfecho`, `motivo_negativa_id` → `oportunidade_motivo`, `motivo_negativa_obs`, `proximo_contato_em`, `servico_previsto_em`, `notas_encerramento`; reservados Fase 2 `humor_cliente`, `qualidade_conversa`, `script_versao`), colunas `feedback_registros.proximo_contato_em` e `chamadas_count` (trigger de recontagem), `oportunidade_motivo.aplica_a`. RLS `authenticated USING(true)` como o módulo. Decisões: ids numéricos (não uuid); status **reusa `em_andamento`**; RPCs `SECURITY DEFINER` chamadas só pelas rotas (service role) com o atendente por parâmetro, vindo da sessão validada — `auth.uid()` não é usado nelas.

**RPCs**
- `feedback_iniciar_chamada(cliente_key, atendente_id, atendente_nome, oportunidade_id?, registro_id?, telefone?)`: reaproveita chamada aberta do mesmo atendente; outro atendente há < 2 h → `EM_ATENDIMENTO_POR:<nome>`; ≥ 2 h encerra a antiga como `sem_resposta` com nota automática. Resolve o registro (id → oportunidade.feedback_id ou cria R4→crm/demais→rfm → registro aberto mais recente do cliente → cria rfm), põe `em_andamento` e abre a chamada guardando `status_anterior` (registro nascido na ligação volta a `aberto` se cancelar).
- `feedback_encerrar_chamada(chamada_id, atendente_id, payload)`: idempotente (mesmo desfecho → `ja_encerrada`; outro → `JA_ENCERRADA_COM_OUTRO_DESFECHO`). Efeitos: `servico_agendado`/`vendeu`/`recusou` → `concluido` + oportunidade `atendida`; `retornar` → `aberto` + data obrigatória; `sem_resposta` → `sem_resposta` (ou `aberto` se o registro tem < 24 h) + retorno padrão +30 d; `numero_errado` → `aberto` + tag de pendência cadastral na pasta. Também grava `data_contato`, `motivo` (nome do motivo), acrescenta o resumo em `acao` (RFM) ou `feedback` (CRM) e uma entrada em `tentativas`.
- `feedback_cancelar_chamada(chamada_id, atendente_id)`: só sem notas; apaga a chamada e devolve o registro ao `status_anterior`.

**Camada TS** (`src/lib/feedbacks/atendimento/`): `chamada.ts` (puro: catálogo `DESFECHOS`, `efeitosDoDesfecho` espelho da RPC para a prévia, `validarEncerramento`, `mapearErroRpc` → 400/403/404/409), `chamada-db.ts` (servidor), `chamada-client.ts` (navegador; `salvarAoVivo` = autosave direto pelo supabase-js filtrando `atendente_id = auth.uid()` e `encerrada_em is null`), `use-chamada.ts` (hook: situação, cronômetro, autosave com debounce 1,5 s e retry 5 s, `beforeunload`), `tempo.ts`. Rotas: `GET/POST /api/feedbacks/atendimento/chamada` (situação + motivos / iniciar) e `PATCH/DELETE /api/feedbacks/atendimento/chamada/[id]` (encerrar / cancelar), todas atrás de `exigirPermissao("feedbacks","atendimento")`.

**UI** — `PainelLigacao.tsx` (coluna direita): sem ligação → telefones em rádio, **▶ Iniciar ligação**, aviso "🎧 Fulano está em ligação" quando é de outro, e "Registrar sem ligar" (abre o `ModalFeedback`); em ligação → cronômetro, telefone usado, notas com indicador "salvo · hh:mm:ss"; ao encerrar → seis botões (Serviço agendado ✅, Vendeu 💰, Retornar depois 🔁, Recusou ❌, Não atendeu 📵, Número errado ☎️), campos que o desfecho pede (motivo, data de retorno com default, data prevista do serviço, resumo), **prévia** do efeito ("Ao encerrar: atendimento fica em aberto · retorno em …") e os botões **■ Encerrar ligação** (só válido) e **Cancelar ligação** (só sem notas). Ao encerrar volta à fila com toast. No card "Por que ligar", em ligação, cada oportunidade ganha o rádio "Este é o assunto da ligação" (grava `oportunidade_id` na chamada). Fila: botão **Atender →** inicia a ligação e abre o cockpit; "🎧 com Fulano" quando outro atendente está na linha (lido de `feedback_chamada`); link "só ver a ficha". Deep-links `?oportunidade=` e `?registro=` iniciam a ligação ao abrir; o botão **Atender** das Oportunidades e o **Preencher atendimento** dos cards CRM/RFM (registro em aberto) levam ao cockpit quando o usuário tem a permissão, senão seguem o fluxo antigo. A **Agenda** passou a usar `proximo_contato_em` quando existe (fallback +30 d) e lê as datas como local.

**Validado** (10/09/2026): 65 testes vitest; smoke test das RPCs no banco real (13 checagens) e fluxo completo no navegador com cliente fictício "TESTE COCKPIT ZZZ" (iniciar, autosave persistido, encerrar "não atendeu" com regra das 24 h, volta à fila, Atender pela fila, cancelar), com limpeza total depois.

**Fora de escopo / dívidas**: Fase 2 feita (§9.7), Fase 3 (R8/R9 + migrar `oportunidade_contatos`), criar OS a partir do cockpit, seis cópias de `carregarMapaClientes()`, cron do recompute fora do repo, `buscarHistoricoCliente` ainda pela anon key no modal antigo, `ClientePicker`/`ClienteChip` com URL fixa.

### 9.7 Fase 2 — roteiro, termômetros e retorno inteligente (10/09/2026)

**Migration `sql/create-feedback-roteiro.sql`** (⚠️ conferir se APLICADA; sem ela o card Roteiro não aparece e o retorno usa os padrões) + `sql/rollback-feedback-roteiro.sql`. Cria `feedback_script` (`regra` = `geral` ou R1..R7, `etapa` = apresentacao | argumentacao | objecao, `titulo`, `template`, `ativo`, `versao`, `ordem`; RLS do módulo) com 12 frases semeadas (só se a tabela estiver vazia), recria o CHECK de `feedback_config_regras.regra` com R1..R7 + `retorno` e insere a linha `retorno` (`retorno_dias_padrao` 30, `retorno_dias_humor_baixo` 90, `humor_baixo_max` 2, `sugerir_caveira_apos` 2). Editar roteiros e parâmetros direto nas tabelas (sem tela ainda).

**Roteiro** (`src/lib/feedbacks/atendimento/roteiro.ts`, puro): lista FECHADA de variáveis `{nome}` `{primeiro_nome}` `{trator}` `{horimetro}` `{ultima_os_data}` `{ultima_os_desc}` `{proxima_revisao}` `{dias_sem_contato}` `{atendente}`, cada uma com frase alternativa quando o dado falta (`resolverTemplate` nunca deixa `{x}` cru; variável desconhecida é removida). `dadosDoContexto` monta as variáveis a partir da ficha (1ª máquina, 1º serviço, atendimentos) e `montarRoteiro` escolhe `geral` sempre + argumentação só das regras presentes nos motivos (nenhuma regra → todas, como referência). Servidor: `roteiro-db.ts` (`listarScripts`, `configRetorno`, `humoresRecentes`), tudo dentro do `montarContexto` (`ctx.roteiro`, `ctx.config_retorno`, `ctx.humores_recentes`). UI: card **🗣️ Roteiro** acima de "Por que ligar", etapas em `<details>` (Apresentação aberta), frases já resolvidas; `title` mostra quais dados faltaram.

**Termômetros** (`retorno.ts` + `PainelLigacao`): ao escolher um desfecho em que houve conversa (`pede_termometros`: serviço agendado, vendeu, retornar, recusou), aparecem **Como o cliente estava?** (😡 Irritado … 😄 Ótimo, 1–5) e **Como foi a conversa?** (1–5), ambos obrigatórios (`validarEncerramento` com `ehNota`; a rota também valida). "Não atendeu" e "Número errado" dispensam. Gravados em `feedback_chamada.humor_cliente` / `qualidade_conversa`.

**Retorno inteligente** (`sugerirRetorno`): `sem_resposta` → dias padrão (30); `retornar` → sugestão de 7 dias, ou `retorno_dias_humor_baixo` (90) quando humor ≤ `humor_baixo_max`; a data continua editável e a explicação aparece sob o campo. Humor baixo mostra a caixa "marcar como **Cliente sensível** na pasta" (já marcada; a tag entrou em `TAGS_CLIENTE` e é gravada em `feedback_clientes_info.tags` ao encerrar, best-effort). `sugerirCaveira`: humor 1 na ligação atual e nas anteriores (`sugerir_caveira_apos`, padrão 2 seguidas) mostra o aviso "considere marcar Não contatar pelo CRM" — **nunca automático**. A **fila** mostra o emoji do humor da última ligação encerrada (`ultimo_humor` em `agruparFila`, lido de `feedback_chamada`).

**Validado** (10/09/2026, Playwright + banco): retornar com humor 2 → retorno 09/12/2026 (90 d), checkbox sensível marcada, `feedback_chamada` com humor 2 / qualidade 3, registro em aberto com o retorno, pasta com a tag; 65 testes vitest. Sem a migration aplicada, o cockpit funcionou com os padrões e sem o card Roteiro (degradação silenciosa com um aviso no log).

**Follow-ups**: tela para editar roteiros/parâmetros (hoje é direto na tabela); mostrar o último humor também nos cards CRM/RFM; Fase 3.

### 9.8 Filtro por motivo, "Minha área", cadastro incompleto (R8) e contatos por cargo (10/09/2026)

**Migration `sql/feedbacks-add-r8-cadastro.sql`** (⚠️ conferir se APLICADA; rollback `sql/rollback-feedbacks-add-r8-cadastro.sql`): amplia os CHECKs de `regra` em `feedback_oportunidades`, `feedback_config_regras` e `feedback_script` com `R8_cadastro` (e `areas` na config); insere a config `R8_cadastro` (`emails_internos`, `dominios_internos`, `somente_com_atividade`, `atividade_meses` 24, `recente_meses` 6) e a config `areas` (função → regras); semeia o roteiro de argumentação da R8. Sem ela, o recompute da R8 falha no CHECK (as outras regras seguem) e "Minha área" usa a tabela padrão do código.

**Fila — filtro por motivo e "Minha área"**: linha de chips com os motivos presentes na fila (OR entre os marcados; "limpar"), aceita `?regra=R5_pecas,R8_cadastro` na URL (link compartilhável, ex.: a lista do departamento de Peças). O chip **⭐ Minha área · <área>** aparece quando a função do usuário (`financeiro_usu.funcao`, via `useAuth`) casa por "contém" com uma chave da config `areas` (`src/lib/feedbacks/atendimento/areas.ts`: `regrasDaFuncao`, sem acento/caixa; padrão Peças → R5+R8, Pós-Vendas → R1/R2/R4/R6/R7/R8, Serviço, Comercial/Vendas → R3/R5). A rota da fila devolve `areas` lida de `feedback_config_regras`. Link "👥 Contatos por cargo" no cabeçalho.

**R8 — Cadastro incompleto** (`src/lib/feedbacks/oportunidades/r8-cadastro.ts` + parte pura `r8-puro.ts`): varre `portal_nt_clientes_cadastro_omie` (exclui inativos e tag Fornecedor); entra quem está sem telefone, sem e-mail ou com **e-mail interno da loja** (lista + domínio `novatratores`), desde que tenha OS ou PV nos últimos `atividade_meses`; prioridade Normal se a atividade é dos últimos `recente_meses`, senão Baixa. `detalhes`: `faltando[]`, `telefone_atual`, `email_atual`, `ultima_atividade`. Some sozinha na recomputação seguinte quando o cadastro é corrigido. Está no orquestrador (`index.ts`), na rota `recomputar` (que agora aceita `?regra=` para as 8 regras — antes só R1..R4), no Kanban de Oportunidades (coluna "Cadastro incompleto" 📇), no card (`renderizarDetalhes`) e nos rótulos do cockpit.

**Cockpit — "✎ Corrigir cadastro"** (`CorrigirCadastro.tsx`): modal com telefone e e-mail atuais; grava no Omie pela rota existente `PATCH /api/feedbacks/cliente-omie` (reenvia o cadastro completo e espelha no Supabase) e recarrega a ficha. O "Salvar" só libera com mudança válida (telefone com DDD, e-mail bem formado). A identidade ganhou `email_interno` (calculado com a config R8): a ficha mostra "e-mail da loja" ao lado do e-mail e um aviso quando falta telefone ou o e-mail é interno.

**Contatos por cargo** (`/feedbacks/atendimento/contatos` + `GET /api/feedbacks/atendimento/contatos?cargo=`): lê o NovaZap com uma busca por cargo (`/search/contacts?q=<cargo>`, até 6 páginas por cargo) e filtra **exato** por `cliente_cargo` (`contatosPorCargo` em `src/lib/chatwoot/parsers.ts`); tabela com contato, cargo, cliente, telefone/WhatsApp, fazendas e "Abrir ficha" (`omie_<cod>` a partir de `cliente_ref`). Chips por cargo com contagem, busca por nome/cliente; aviso quando a lista foi cortada em 90 por cargo. Sem as env do NovaZap mostra "não configurado".

**Validado** (10/09/2026): 70 testes vitest; fila com `?regra=R5_pecas` (412 de 510) e "Minha área · Pós-Vendas (125)"; modal Corrigir cadastro abre preenchido e só libera com mudança (não gravado em cliente real); card Roteiro com frases resolvidas após a migration da Fase 2.

**Follow-ups**: tela para editar roteiros/parâmetros/áreas; refinar a R5 para vendas de balcão (categoria/CFOP que o dashboard já separa); Fase 3 (sugestões da Inteligência Comercial na fila + migrar `oportunidade_contatos`).
