# Dashboard de Vendas (`/estoque/dashboard`) — Levantamento (Fase 0)

> Levantamento de 08/10/2026, sem mudança de código. Fontes: código atual do portal, o app antigo
> `omie-consulta-estoque/server.js` (lido localmente), consultas de leitura ao banco (REST, service role)
> e chamadas cronometradas às rotas de produção. Referências `arquivo:linha` valem para o commit `fda5c9bf`.

Sumário: [1. Mapa KPI → cálculo](#1-mapa-kpi--rota--função--tabelas--regra) ·
[2. Classificação de peças](#2-classificação-de-peças) · [3. Granularidade de datas](#3-granularidade-real-de-datas) ·
[4. Cache por mês](#4-como-o-sistema-sabe-se-um-mês-tem-cache) · [5. Tempo de resposta](#5-tempo-de-resposta-produção) ·
[6. Painel antigo](#6-lógica-do-painel-de-histórico-antigo) · [7. Divergências e bugs](#7-divergências-e-bugs-encontrados) ·
[8. Impacto nas fases](#8-impacto-no-prompt-das-fases-15)

---

## 1. Mapa KPI → rota → função → tabelas → regra

Página: `src/app/(portal)/estoque/dashboard/page.tsx` (client, 1536 linhas, todos os componentes no mesmo arquivo).
Libs em `src/lib/estoque/`. Gráficos: só recharts 2.

### 1.1 Rotas

| Rota | Função | Lê |
|---|---|---|
| `GET /api/estoque/dashboard` | `montarDashboard` (dashboard.ts:183) | vendas_itens, os_mensal, notas_entrada, categorias_dashboard |
| `/tendencia` | `montarTendencia` (dashboard-listas.ts:478) | 36 meses de vendas_itens + os_mensal + 12× `comprasPecasMes` |
| `/historico?catKey=` | `montarHistorico` (dashboard-listas.ts:57) | vendas_itens desde jan/2023 + os_mensal |
| `/vendas` | `listarVendas` (dashboard-listas.ts:296) | vendas_itens + Produtos_Completos, produto_tipo, cmc_historico, produtos, cadastro_omie |
| `/pedido-itens` | `listarPedidoItens` (:387) | vendas_itens |
| `/compras` | `listarCompras` (:419) | notas_entrada (12 chamadas no modo ano) |
| `/categorias-vendas` | `listarCategoriasVendas` (:166) | vendas_itens (cache 10 min) |
| `/os` | `obterServicosPopup` (os.ts:821) | os_servicos_itens, os_nfse, os_mensal |
| `/nf` | `consultarPedido` Omie ao vivo + `lib/ajustes/notas.ts` | Omie |

**Nenhuma dessas rotas exige login** — ver bug B1.

### 1.2 Períodos e comparação (`montarDashboard`)
- Parâmetros: `mes` (padrão = mês atual), `modo=ano` ou `mes=0`, `ano`, `categoria`, `conta` (route.ts:15-19).
- Modo mês: atual = `obterDadosPeriodo(mes)`; anterior = mês anterior; anoAnt = mesmo mês de ano−1 (dashboard.ts:191-206).
- Modo ano: atual = `obterDadosAno(ano)`; anterior = zerado; anoAnt = `obterDadosAno(ano−1)` (200-206).
- `calcVar(a,b) = b>0 ? (a-b)/b*100 : (a>0 ? 100 : 0)` — duplicada em dashboard.ts:208 e page.tsx:130.

### 1.3 Period-to-date (PTD)
- `diaCorte = !ehAno && ehMesAtual ? hoje.getDate() : null` (dashboard.ts:198). **Só no modo mês, só no mês corrente.**
  O mesmo corte vale para atual, mês anterior e ano anterior.
- **Cortado:** vendas (pelo dia de `vendas_itens.data_pedido`, vendas-sync.ts:115-121) e entradas (pelo dia de
  `notas_entrada.data_emissao`, cruzamento-familia.ts:1426-1429).
- **Não cortado:** serviços (`os_mensal` é mensal), composição HR/KM, YTD de máquinas, todo o modo ano.
- Na UI os cards Peças+Serviços e Serviços recebem `comparavel={!parcial}` → Δ "—" no mês corrente (page.tsx:649, 669).
  O sufixo "(1–N)" só aparece quando há corte (page.tsx:1082-1096).

### 1.4 Δ cinza (base pequena)
- `BASE_MIN_PECAS = 1000` (R$) e `BASE_MIN_MAQ_UN = 2` (unidades) — page.tsx:26-27.
- Cinza `#9ca3af` quando a base do comparativo está abaixo do limiar: Peças+Serviços (648), Total Peças (653-654),
  Serviços (667-668), Entradas (680), PecaCard (1144-1145), Máquinas (580-581, 1168-1169).
- Em Custo/Margem o limiar continua sendo medido sobre a **venda** (bug B13).

### 1.5 Selos
| Selo | Regra | Onde |
|---|---|---|
| queda acentuada | métrica = venda, não parcial, base ano ant. ≥ R$ 1.000 e Δ ano < −50% | P+S (649), Total Peças (655), Serviços (670) |
| queda acentuada (máquinas) | não parcial, unidades ano ant. ≥ 2 e Δ **receita** < −50% | page.tsx:583 |
| acima do histórico | `entradas/peças > 1,5 × mediana(entradas/peças)` dos meses fechados dos últimos 12 | page.tsx:630-641, 687 |
| mês/ano em andamento | modo mês: mês corrente; modo ano: ano corrente | dashboard.ts:213, page.tsx:557 |

### 1.6 KPIs
| KPI | Regra |
|---|---|
| **Peças + Serviços** | Recalculado na página = Total Peças + Serviços (page.tsx:625-629); o `totalGeral` do servidor (dashboard.ts:284) não é usado |
| **Total Peças** | Σ dos buckets de `agregarCardsPecas` (categorias.ts:188-236). Custo = `cmc_unitario × qtd` se ambos > 0, senão 0 |
| **Serviços** | `os_mensal.valor_nota` (OS com NFS-e); se `valor_nota` é null cai para `valor_total` (inclui interno) — dashboard.ts:52, 262. Custo sempre 0 |
| **Entradas de Peças** | `comprasPecasMes` (cruzamento-familia.ts:1408): itens de `notas_entrada` (`vProd`, sem impostos), família via `produtos.familia_nome` ou SKU, só `classificarGrupo = 'peca'`. Ignora o filtro de categoria |
| **Máquinas · período** | `agregarMaquinas` (categorias.ts:253): por `familia`, receita, unidades, CMV. Top 8 + "Outras" |
| **Máquinas YTD** | `buscarItensDoBanco` de jan até o mês selecionado (dashboard.ts:357-364), sem PTD e sem sync |
| **Decomposição Serviços** | `os_servicos_itens` com `os_nfse.tem_nota=true` → HR / KM / Outros (os.ts:788-805); internos retorno/puro "não somados" |

### 1.7 Gráficos
- **Tendência 12 meses** (`/tendencia`): Peças Oficina / Peças Balcão / Serviços (+ máquinas e entradas). Só respeita a conta —
  ignora período, categoria e métrica. Alimenta sparklines, PecasChart, MaquinasChart e a mediana do selo "acima do histórico".
- **Histórico** (`/historico`): LineChart mensal desde jan/2023 (venda, custo; serviços com valor × qtd de OS).

---

## 2. Classificação de peças

- **É peça?** (`ehPecaVenda`, categorias.ts:136-141): família contém "peca" → sim; família preenchida com outra coisa → não;
  família vazia → sim só se `codigo_categoria` está nas categorias de peça.
- **Oficina × Balcão** (só no gráfico de tendência, dashboard-listas.ts:534-542): Balcão = peça com `codigo_categoria = 1.01.03`;
  Oficina = **todo o resto das peças** (inclusive peça com categoria fora de 1.01.x).
- **Grupos do filtro de categoria** (`CATEGORIAS_AGRUPADAS`, categorias.ts:46-49): "Revenda de Peças Oficina" =
  1.01.01, .02, .92, .94, .95, .96, .99; "Revenda de Peças Balcão" = 1.01.03.
- **Cards por categoria** (`classificarCardPeca`, categorias.ts:157-166), nesta ordem: Filtros → Lubrificantes → Peças diversas
  (palavra-chave ou `tipo` vazio) → um card por `tipo`. Configuração em `categorias_dashboard` (nome, palavras_chave, posição, slug;
  cache 5 min). O `tipo` vem da característica "Tipo" da Omie via `produto_tipo` e é **congelado** em `vendas_itens.tipo` no sync.
- **Máquina** (`classificarGrupo`, cruzamento-familia.ts:38-47): família não vazia, sem "peca", sem kit de revisão nem ativo imobilizado.

---

## 3. Granularidade real de datas

| Tabela | Coluna de data | Formato | Granularidade | Observação |
|---|---|---|---|---|
| `vendas_itens` | `data_pedido` | **texto `DD/MM/AAAA`** | dia | É `data_previsao || dInc` do pedido Omie — **não é a data de faturamento** |
| `vendas_itens` | `mes`, `ano` | int | mês | **Janela do sync**, não deriva da data (ver B7) |
| `os_mensal` | `mes`, `ano` | int | **só mês** | Competência por `dDtFat` da OS, sobrescrita por `comissoes_os_relatorio.data_ref` |
| `os_servicos_itens` | `data` | texto `DD/MM/AAAA` | dia | Data de **faturamento da OS** (`dDtFat || dDtInc || dDtPrevisao`, os.ts:263, 621) |
| `os_nfse` | — | — | **nenhuma** | Só `tem_nota`, `nfse_num`, `verificado_em`. Não guarda a data de emissão da NFS-e |
| `notas_entrada` | `data_emissao` (e `data_registro`) | texto `DD/MM/AAAA` | dia | `mes/ano` derivam de `data_emissao` |

**Dá para recortar serviços por dia?** Só de forma aproximada: pelos itens de `os_servicos_itens.data` (faturamento da OS)
filtrados por `os_nfse.tem_nota`. Não existe data da NFS-e no banco. E a soma dos itens não fecha exatamente com
`os_mensal.valor_nota` (que vem do cabeçalho da OS no último refresh — B14). Para usar recorte diário de serviços seria preciso
aceitar essa diferença ou passar a gravar a data da NFS-e.

Números de 08/10/2026: `vendas_itens` 24.474 linhas (jan/2022 → out/2026), `os_servicos_itens` 11.558, `os_nfse` 4.132,
`os_mensal` 148 linhas.

---

## 4. Como o sistema sabe se um mês tem cache

- Existe a tabela **`cache_controle`** com chave `(tipo, mes, ano, conta_omie)` e coluna `ultima_data` (texto `DD/MM/AAAA`),
  `tipo ∈ {vendas, os}` (vendas-sync.ts:48-73). Hoje: `vendas` jan/2022 → out/2026 e `os` nov/2022 → out/2026, para NOVA e CASTRO,
  sem buracos.
- **Ressalvas:**
  - `cache_controle('vendas')` só é gravado quando o mês tem pedidos (vendas-sync.ts:367, 395) — mês sem venda nunca fica "sincronizado".
  - Não há controle para `notas_entrada` (entradas) nesta tabela.
  - Regra atual da leitura (vendas-sync.ts:517-522): tem linhas → usa; sem linhas mas com `cache_controle` → 0 legítimo;
    sem nenhum dos dois → dispara sync em segundo plano e **responde 0** naquele request.
  - `os_mensal` tem 51 linhas com `conta_omie` vazia (2022-01 → 2026-03, todas zeradas) — sobra de antes da separação por conta.
- **Proposta para "sem dados"**: um mês só é `ok` quando há linha em `cache_controle` do tipo certo **para cada conta pedida**;
  sem linha → `sem_dados`. Para isso o sync precisa passar a gravar `cache_controle` também em mês sem pedidos (valor 0 legítimo),
  e as entradas precisam de um controle equivalente (ou se aceita "sem notas = 0").

Sincronização: o cron `estoque-sync-incremental.yml` (:05 e :35, 06h–20h BRT) chama `/api/estoque/cron/sync-incremental`.
O GET do dashboard também dispara sync (ver B10/B11).

---

## 5. Tempo de resposta (produção)

Medido em 08/10/2026 com `curl` contra `portal.novatratores.com`, conta Todas, duas chamadas seguidas:

| Chamada | 1ª | 2ª | Tamanho |
|---|---|---|---|
| `/api/estoque/dashboard?modo=ano&ano=2025` | 8,4 s | 4,3 s | 16 KB |
| `/api/estoque/dashboard?modo=ano&ano=2026` | 6,4 s | 5,5 s | 26 KB |
| `/tendencia` | 9,5 s | 6,8 s | 7 KB |
| `/historico?catKey=totalGeral` | 5,7 s | 5,1 s | 5 KB |
| `/historico?catKey=totalPecas` | 5,2 s | 4,6 s | 5 KB |
| `/compras?modo=ano&ano=2025` | 2,3 s | 1,3 s | 770 KB |
| `/vendas?modo=ano&ano=2025&catKey=totalPecas` | 7,2 s | 7,2 s | **2,4 MB** |

A página abre com dashboard + tendência + categorias em paralelo → **~7–10 s até ficar completa** no "Ano inteiro".
O custo vem de ler dezenas de milhares de linhas cruas pela REST (páginas de 1000) e agregar em JS a cada requisição.
A meta da Fase 1 (< 1 s para 4 anos) exige agregar no banco.

---

## 6. Lógica do painel de histórico antigo

Fonte: `C:\Users\hhenr\omie-consulta-estoque\server.js` (Express). API `/api/dashboard/historico` (2938-3043),
front em `renderHistoricoCompleto` (5982), `renderAnoRow` (5620), `calcPrevisao` (5552).

- **Dados:** `vendas_itens` por `mes/ano` (janela do sync), desde jan/2023; `os_mensal.valor_total` para Serviços/Total Geral.
  Pedidos = nº de `numero_pedido` distintos **do mês inteiro** (ignora card e categoria, inclui máquinas).
- **Grade:** uma linha por ano; 12 meses com mini-barra, valor e nº de pedidos; 13ª coluna = total do ano (venda, custo ou
  margem, conforme o modo) + ticket médio = total ÷ pedidos. Cores fixas por ano: 2023 `#1976d2`, 2024 `#00897b`,
  2025 `#f57c00`, 2026 `#c62828`, 2027 `#6a1b9a`.
- **Trimestres:** soma de 3 meses. Trimestre incompleto ou com mês futuro mostra a soma, mas **sem Δ**. MoM trimestral compara
  com o trimestre anterior (T1 com o T4 do ano anterior); YoY com o mesmo trimestre do ano anterior.
- **Δ%:** base zero → sem indicador. **Não havia limiar de base pequena** no painel. O mês corrente era comparado sem ajuste
  (aparecia como queda).
- **Dias úteis:** segunda a sexta, **sem feriados** (comentário na linha 642). `diasUteisAteHoje` inclui hoje.
- **Projeção do mês corrente:** `valor ÷ (DU decorridos ÷ DU do mês)`, só com ≥ 5 dias úteis decorridos. Barra esmaecida "proj:".
- **Previsão do mês seguinte:** média dos 3 últimos meses × fator sazonal dos anos anteriores. (Fora de escopo no prompt.)
- **Comparar:** Empresas (2 buscas, NOVA e CASTRO); Categorias (1 busca por card); Venda × CMC × Margem (derivado no front).
  Cada célula empilha uma mini-barra e um valor por série; sem projeção nem pedidos nesse modo.
- **Clique no mês:** abre a tabela de itens vendidos daquele mês (mesma lógica do drill-down de vendas).

Hoje o portal já tem `src/lib/estoque/utils.ts` com `diasUteisDoMes`/`diasUteisAteHoje` (seg–sex, sem feriado) e
`src/lib/assistente/horario.ts` com **feriados nacionais (incluindo Páscoa/Carnaval/Corpus Christi) + `FERIADOS_EXTRAS`** — base
reaproveitável para a Fase 4.

---

## 7. Divergências e bugs encontrados

Ordem: impacto. "Confirmado" = visto no banco ou em produção; "código" = lido no código, não reproduzido.

| # | Problema | Evidência | Onde |
|---|---|---|---|
| **B1** | **Rotas `/api/estoque/dashboard/*` sem login.** Qualquer pessoa com a URL lê vendas, clientes e valores; `/nf` chama a Omie; o GET principal dispara sync e escrita no banco | Confirmado (todas responderam 200 sem token) | route.ts das 9 rotas; `middleware.ts` só casa `/P/*` |
| **B2** | **Mês do item ≠ mês do pedido.** O sync incremental grava em `mes/ano` a janela consultada; pedido alterado depois cai no mês seguinte | Confirmado: **156 linhas (R$ 70.935)** com `mes/ano` ≠ `data_pedido`, todas de abr/2026 em diante (pós-porte) | vendas-sync.ts (delta 419-481) |
| **B3** | **Dupla contagem entre meses.** Mesmo pedido+produto gravado em dois meses | Confirmado: **29 pares, R$ 14.877 a mais** (ex.: NOVA pedido 6823 em mar e abr/2026) | idem B2 |
| B4 | Delta incremental não remove pedido cancelado/movido — só apaga as datas presentes nos pedidos novos | Código | vendas-sync.ts:445-457 |
| B5 | Modo "Ano inteiro" do ano corrente compara o acumulado parcial com o **ano anterior cheio**, com Δ colorido | Código | dashboard.ts:198; page.tsx:1072 |
| B6 | Clientes ignorados (`ignorar_clientes`) saem dos cards e da tabela de vendas, mas **não** do histórico nem da tendência → sparkline ≠ card | Código | dashboard-listas.ts:77-86, 499-508 vs vendas-sync.ts:108 |
| B7 | Tendência/sparklines ignoram categoria, métrica e período; a razão compra/venda divide entrada **sem** filtro por venda **com** filtro | Código | page.tsx:228, 620, 630 |
| B8 | CMC ausente vira custo 0 e infla a margem. Os cards não enriquecem o CMC; a tabela de vendas enriquece → popup ≠ card | Confirmado: **720 linhas de peça sem CMC (R$ 310.706)**, ~3% das linhas | categorias.ts:203, 261; dashboard-listas.ts:214-248 |
| B9 | A tabela de vendas reclassifica família/tipo via `produto_tipo`; os cards usam o valor congelado → soma do popup ≠ card | Código | dashboard-listas.ts:334-349 |
| B10 | Mês passado sem cache responde 0 e dispara sync; mês sem pedidos nunca grava `cache_controle` e re-sincroniza a cada GET; OS com total 0 idem | Código | vendas-sync.ts:367, 517-522; os.ts:432-438 |
| B11 | Em "Todas" (padrão forçado da página) o sync disparado pelo dashboard roda só para **NOVA**. CASTRO depende do cron | Código | vendas-sync.ts:511; page.tsx:139 |
| B12 | Split de serviços: com `valor_nota` null o card mostra o total com interno; em "Todas" basta uma conta sem split para anular; tendência mistura | Código | dashboard.ts:52, 262; os.ts:360; dashboard-listas.ts:523 |
| B13 | Máquinas: limiar por unidades, selo e Δ por receita; em Custo/Margem o limiar continua sobre a venda | Código | page.tsx:580-583, 653-654, 1144 |
| B14 | Decomposição HR/KM/Outros (itens) não fecha com o card (cabeçalho da OS) | Código | os.ts:675; dashboard.ts:273-278 |
| B15 | Família `#N/D` some dos dois lados (não é peça nem máquina); família vazia é peça na venda mas "ignorar" na entrada | Código | categorias.ts:132-140; cruzamento-familia.ts:1434 |
| B16 | Serviços do mês corrente só atualizam 1×/dia pelo dashboard | Código | os.ts:401 |
| B17 | `montarHistorico.proporcao` sempre calcula como se fosse mês corrente (código morto) | Código | dashboard-listas.ts:155-158 |
| B18 | Lógica duplicada: `calcVar`, regra "nota ?? total" (5 lugares), leitura paginada de `vendas_itens` (3 lugares, só 1 aplica ignorar), agregação "Todas" de `os_mensal` (2 lugares) | Código | ver relatório |

**A conferir com a Omie (não é bug comprovado):** NOVA abr/2026 tem 147 linhas e R$ 268 mil, contra 300–450 linhas e
R$ 0,6–2,3 mi nos meses vizinhos.

**Do app antigo** (para não repetir): pedidos do ticket médio contavam o mês inteiro, inclusive máquinas; previsão do mês
seguinte usava o mês corrente parcial na média; Δ do mês no modo Custo/Margem usava sempre a venda; base zero tratada
diferente no painel (sem Δ) e nos cards (+100%).

---

## 8. Impacto no prompt das Fases 1–5

Pontos em que o levantamento contradiz ou ajusta o rascunho do prompt:

1. **"Serviços: data da NFS-e"** não existe no banco. O que existe é a competência de `os_mensal` (faturamento da OS) e a data
   de faturamento por item. Decidir: usar faturamento da OS, ou passar a gravar a data da NFS-e.
2. **Data de referência de peças** — `data_pedido` é previsão/inclusão do pedido, e a coluna `mes/ano` é a janela do sync
   (B2/B3). A Fase 1 precisa escolher **uma** e, se for `data_pedido`, a soma do agregado **não vai bater** com a tela atual nos
   meses afetados (156 linhas). O critério "diferença 0 ou explicada item a item" deve prever isso.
3. **"RPC SECURITY DEFINER com checagem de permissão no mesmo padrão das existentes"** — o módulo de estoque não usa RPC
   hoje; tudo passa por rota Node com service role. O padrão do portal para RPC é: rota checa a sessão e chama a RPC com
   service role (REVOKE de anon/authenticated). Antes de qualquer fase nova, **B1 precisa ser fechado** (`protegerRota` com
   o módulo `estoque:dashboard`), senão a camada nova herda a mesma porta aberta.
4. **"Sem dados ≠ R$ 0"** depende de mudar o sync para gravar `cache_controle` em mês sem pedidos (B10) e de um controle para
   entradas.
5. **Projeção (Fase 4)** — o "só onde há granularidade diária" exclui serviços, a menos que se aceite o recorte aproximado pelos
   itens. Feriados: já existe `lib/assistente/horario.ts` (nacionais + extras por env); a tabela de feriados municipais pode
   começar a partir dele.
6. **Fase 1 < 1 s** é viável só com agregado no banco: hoje cada abertura lê ~25 mil linhas cruas.
7. Recomendação de ordem: **B1 (login) → B2/B3/B4 (mês do item e duplicidade) → Fase 1**. Os demais bugs podem ser corrigidos
   dentro das fases em que a tela for tocada.
